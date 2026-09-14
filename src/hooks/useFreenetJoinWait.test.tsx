/**
 * @vitest-environment jsdom
 */

import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { FreenetHostStatus } from '../../units/puf-freenet-host/src/types.ts';
import { useFreenetJoinWait } from './useFreenetJoinWait';

function host(peerCount: number): FreenetHostStatus {
  return {
    hostId: 'puf-freenet-host',
    mode: 'managed',
    reachable: true,
    wsUrl: 'ws://127.0.0.1:7509',
    wsHost: '127.0.0.1',
    wsPort: 7509,
    configDir: '',
    dataDir: '',
    logDir: '',
    updateRequired: false,
    nodeRing: { peers: [], peerCount, peerSource: peerCount > 0 ? 'count' : 'none' },
  };
}

describe('useFreenetJoinWait', () => {
  it('first paint is connecting, not an error, then ready when N≥1', async () => {
    const ensureHost = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useFreenetJoinWait(true, {
        readHost: async () => host(3),
        ensureHost,
        isHoldOff: () => false,
        isOffline: () => false,
        pollMs: 60_000,
      }),
    );
    expect(result.current.view.phase).toBe('connecting');
    expect(result.current.view.tone).toBe('wait');
    await waitFor(() => expect(result.current.view.phase).toBe('ready'));
    expect(result.current.view.peerCount).toBe(3);
    expect(ensureHost).toHaveBeenCalled();
  });

  it('names hold-off on first paint instead of spinning', () => {
    const ensureHost = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useFreenetJoinWait(true, {
        readHost: async () => host(0),
        ensureHost,
        isHoldOff: () => true,
        isOffline: () => false,
        pollMs: 60_000,
      }),
    );
    expect(result.current.view.phase).toBe('hold-off');
    expect(result.current.view.tone).toBe('error');
  });
});
