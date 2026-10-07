// @vitest-environment jsdom
import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';
import { useFarmDiaryComposer } from '../src/hooks/useFarmDiaryComposer';

afterEach(() => { cleanup(); vi.useRealTimers(); });
const event = () => ({ preventDefault: vi.fn() }) as unknown as React.FormEvent;
function setup(addEvent: (event: unknown) => Promise<void>) {
  const markIssueInProgress = vi.fn();
  const hook = renderHook(() => useFarmDiaryComposer({
    settings: { farmName: 'Farm', irrigationSystemType: 'micro' },
    addEvent, updateSettings: vi.fn(), focusBlockId: null,
    markIssueInProgress, onSwitchToTimeline: vi.fn(),
  }));
  act(() => {
    hook.result.current.setWorkTitle('Inspect trees');
    hook.result.current.setLinkedIssueId('issue');
  });
  return { ...hook, markIssueInProgress };
}

describe('composer save feedback', () => {
  it('keeps the draft and linked issue untouched on persistence failure', async () => {
    const { result, markIssueInProgress } = setup(vi.fn().mockRejectedValue(new Error('Disk full')));
    await act(async () => { await result.current.handleSubmit(event()); });
    expect(result.current.workTitle).toBe('Inspect trees');
    expect(result.current.saveError).toBe('Disk full');
    expect(result.current.showSuccess).toBe(false);
    expect(markIssueInProgress).not.toHaveBeenCalled();
  });

  it('waits for durability and prevents duplicate submissions', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const save = vi.fn((_event: unknown) => new Promise<void>(resolve => { release = resolve; }));
    const { result, markIssueInProgress } = setup(save);
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleSubmit(event());
      void result.current.handleSubmit(event());
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.isSaving).toBe(true);
    expect(result.current.showSuccess).toBe(false);
    expect(markIssueInProgress).not.toHaveBeenCalled();
    await act(async () => { release(); await pending; });
    expect(result.current.showSuccess).toBe(true);
    expect(result.current.workTitle).toBe('');
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toEqual(expect.objectContaining({
      type: 'work',
      blockId: undefined,
      linkedIssueId: 'issue',
    }));
    expect(markIssueInProgress).toHaveBeenCalledWith('issue');
    act(() => { vi.runAllTimers(); });
  });

  it('writes one spray entry per selected paddock', async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue({ id: 'spray-1' });
    const { result } = setup(save);
    act(() => {
      result.current.setActiveTab('spray');
      result.current.setSelectedBlockIds(['14', '3', '7']);
      result.current.setAgentName('Copper');
    });
    await act(async () => { await result.current.handleSubmit(event()); });
    expect(save).toHaveBeenCalledTimes(3);
    expect(save.mock.calls.map((call) => (call[0] as { blockId?: string }).blockId)).toEqual(['14', '3', '7']);
    for (const call of save.mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({
        type: 'spray',
        status: 'done',
        agentName: 'Copper',
        sprayType: 'chem',
      }));
    }
    expect(result.current.showSuccess).toBe(true);
    expect(result.current.selectedBlockIds).toEqual([]);
    act(() => { vi.runAllTimers(); });
  });

  it('links a field issue only on the first paddock when a plan covers several', async () => {
    vi.useFakeTimers();
    const save = vi.fn((_event: unknown) => Promise.resolve({ id: 'plan-1' }));
    const { result, markIssueInProgress } = setup(save);
    act(() => {
      result.current.setSelectedBlockIds(['14', '3']);
    });
    await act(async () => { await result.current.handleSubmit(event()); });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[0][0]).toEqual(expect.objectContaining({
      type: 'work',
      blockId: '14',
      linkedIssueId: 'issue',
    }));
    expect(save.mock.calls[1][0]).toEqual(expect.objectContaining({
      type: 'work',
      blockId: '3',
      linkedIssueId: undefined,
    }));
    expect(markIssueInProgress).toHaveBeenCalledTimes(1);
    expect(markIssueInProgress).toHaveBeenCalledWith('issue');
    act(() => { vi.runAllTimers(); });
  });

  it('keeps unsaved paddocks selected when a later save fails', async () => {
    const save = vi.fn()
      .mockResolvedValueOnce({ id: 'spray-1' })
      .mockRejectedValueOnce(new Error('Disk full'));
    const { result } = setup(save);
    act(() => {
      result.current.setActiveTab('spray');
      result.current.setSelectedBlockIds(['14', '3', '7']);
      result.current.setAgentName('Copper');
    });
    await act(async () => { await result.current.handleSubmit(event()); });
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.saveError).toBe('Disk full');
    expect(result.current.showSuccess).toBe(false);
    expect(result.current.selectedBlockIds).toEqual(['3', '7']);
    expect(result.current.agentName).toBe('Copper');
  });
});
