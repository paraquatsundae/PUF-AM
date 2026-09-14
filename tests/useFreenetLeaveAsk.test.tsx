/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { androidAttachedStatus, androidFreenetHostStatus } from '../src/lib/androidFreenetHost.ts';

const statusNow = vi.fn(async () => androidFreenetHostStatus({ mode: 'managed', reachable: true }));
const pluginAvailable = vi.fn(() => true);
const stopHost = vi.fn(async () => androidFreenetHostStatus());

vi.mock('../src/lib/androidFreenetHost.ts', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/androidFreenetHost.ts')>(
    '../src/lib/androidFreenetHost.ts',
  );
  return {
    ...actual,
    androidFreenetHostStatusNow: () => statusNow(),
    isFreenetHostPluginAvailable: () => pluginAvailable(),
  };
});

vi.mock('../src/lib/stopManagedFreenet.ts', () => ({
  stopManagedFreenetHost: () => stopHost(),
}));

import { useFreenetLeaveAsk } from '../src/hooks/useFreenetLeaveAsk';

afterEach(() => {
  statusNow.mockReset();
  pluginAvailable.mockReset();
  stopHost.mockReset();
  pluginAvailable.mockReturnValue(true);
  statusNow.mockResolvedValue(androidFreenetHostStatus({ mode: 'managed', reachable: true }));
});

describe('useFreenetLeaveAsk', () => {
  it('asks before leaving when the Android node is managed', async () => {
    const then = vi.fn();
    const { result } = renderHook(() => useFreenetLeaveAsk());
    await act(async () => {
      await result.current.beginLeave(then);
    });
    expect(result.current.ask?.kind).toBe('managed');
    expect(then).not.toHaveBeenCalled();
    await act(async () => {
      result.current.stopFreenet();
    });
    expect(stopHost).toHaveBeenCalledTimes(1);
    expect(then).toHaveBeenCalledTimes(1);
  });

  it('Keep running leaves the managed node and still signs out', async () => {
    const then = vi.fn();
    const { result } = renderHook(() => useFreenetLeaveAsk());
    await act(async () => {
      await result.current.beginLeave(then);
    });
    await act(async () => {
      result.current.keepRunning();
    });
    expect(stopHost).not.toHaveBeenCalled();
    expect(then).toHaveBeenCalledTimes(1);
  });

  it('does not stop an attached Freenet Android Node', async () => {
    statusNow.mockResolvedValue(androidAttachedStatus());
    const then = vi.fn();
    const { result } = renderHook(() => useFreenetLeaveAsk());
    await act(async () => {
      await result.current.beginLeave(then);
    });
    expect(result.current.ask?.kind).toBe('attached');
    await act(async () => {
      result.current.leaveAttached();
    });
    expect(stopHost).not.toHaveBeenCalled();
    expect(then).toHaveBeenCalledTimes(1);
  });

  it('skips the ask when the plugin is absent', async () => {
    pluginAvailable.mockReturnValue(false);
    const then = vi.fn();
    const { result } = renderHook(() => useFreenetLeaveAsk());
    await act(async () => {
      await result.current.beginLeave(then);
    });
    expect(result.current.ask).toBeNull();
    expect(then).toHaveBeenCalledTimes(1);
    expect(stopHost).not.toHaveBeenCalled();
  });
});
