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
    const save = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
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
    expect(markIssueInProgress).toHaveBeenCalledWith('issue');
    act(() => { vi.runAllTimers(); });
  });
});
