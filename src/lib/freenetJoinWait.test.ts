import { describe, expect, it } from 'vitest';

import type { FreenetHostStatus } from '../../units/puf-freenet-host/src/types.ts';
import { FREENET_LOG_JOINING_COPY } from './freenetRingStatus.ts';
import {
  FREENET_JOIN_CONNECTING_LABEL,
  FREENET_JOIN_HOLD_OFF_LABEL,
  FREENET_JOIN_LISTENING_LABEL,
  FREENET_JOIN_OFFLINE_LABEL,
  FREENET_JOIN_OPENNET_LABEL,
  FREENET_JOIN_TIMEOUT_LABEL,
  FREENET_JOIN_WAIT_OPENNET_MS,
  describeFreenetJoinWait,
  initialFreenetJoinWaitView,
  waitForFreenetJoinOpennet,
} from './freenetJoinWait.ts';

function host(over: Partial<FreenetHostStatus> = {}): FreenetHostStatus {
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
    ...over,
  };
}

describe('describeFreenetJoinWait', () => {
  it('does not use an error tone before the first poll', () => {
    const view = describeFreenetJoinWait({
      elapsedMs: 0,
      holdOff: false,
      offline: false,
      host: null,
      polled: false,
    });
    expect(view.phase).toBe('connecting');
    expect(view.tone).toBe('wait');
    expect(view.label).toBe(FREENET_JOIN_CONNECTING_LABEL);
    expect(view.label).not.toMatch(/needs to connect|not connected|could not connect/i);
  });

  it('starts the initial view as connecting, not a red error', () => {
    const view = initialFreenetJoinWaitView();
    expect(view.tone).toBe('wait');
    expect(view.phase).toBe('connecting');
  });

  it('is connecting while Listening with N=0', () => {
    const view = describeFreenetJoinWait({
      elapsedMs: 1_000,
      holdOff: false,
      offline: false,
      host: host({
        nodeRing: { peers: [], peerCount: 0, peerSource: 'none' },
      }),
      polled: true,
    });
    expect(view.phase).toBe('connecting');
    expect(view.tone).toBe('wait');
    expect(view.label).toBe(FREENET_JOIN_LISTENING_LABEL);
    expect(view.detail).toBe(FREENET_LOG_JOINING_COPY);
  });

  it('is ready when N≥1', () => {
    const view = describeFreenetJoinWait({
      elapsedMs: 800,
      holdOff: false,
      offline: false,
      host: host({
        nodeRing: { peers: [], peerCount: 2, peerSource: 'count' },
      }),
      polled: true,
    });
    expect(view.phase).toBe('ready');
    expect(view.tone).toBe('ok');
    expect(view.label).toBe(FREENET_JOIN_OPENNET_LABEL);
    expect(view.peerCount).toBe(2);
  });

  it('times out after 120s with honest Listening copy', () => {
    const view = describeFreenetJoinWait({
      elapsedMs: FREENET_JOIN_WAIT_OPENNET_MS,
      timeoutMs: FREENET_JOIN_WAIT_OPENNET_MS,
      holdOff: false,
      offline: false,
      host: host({
        nodeRing: { peers: [], peerCount: 0, peerSource: 'unreported' },
      }),
      polled: true,
    });
    expect(view.phase).toBe('timeout');
    expect(view.tone).toBe('error');
    expect(view.label).toBe(FREENET_JOIN_TIMEOUT_LABEL);
    expect(view.detail).toMatch(/Start Freenet/);
    expect(view.detail).toMatch(/cannot be force-stopped/);
    expect(view.detail).not.toMatch(/success|joined/i);
  });

  it('does not time out before 120s while still Listening', () => {
    const view = describeFreenetJoinWait({
      elapsedMs: FREENET_JOIN_WAIT_OPENNET_MS - 1,
      timeoutMs: FREENET_JOIN_WAIT_OPENNET_MS,
      holdOff: false,
      offline: false,
      host: host({ nodeRing: { peers: [], peerCount: 0, peerSource: 'none' } }),
      polled: true,
    });
    expect(view.phase).toBe('connecting');
    expect(view.tone).toBe('wait');
  });

  it('names hold-off instead of spinning', () => {
    const view = describeFreenetJoinWait({
      elapsedMs: 0,
      holdOff: true,
      offline: false,
      host: null,
      polled: false,
    });
    expect(view.phase).toBe('hold-off');
    expect(view.label).toBe(FREENET_JOIN_HOLD_OFF_LABEL);
    expect(view.detail).toMatch(/will not keep spinning/);
  });

  it('names offline instead of spinning', () => {
    const view = describeFreenetJoinWait({
      elapsedMs: 0,
      holdOff: false,
      offline: true,
      host: null,
      polled: false,
    });
    expect(view.phase).toBe('offline');
    expect(view.label).toBe(FREENET_JOIN_OFFLINE_LABEL);
  });

  it('names a leftover attached node on timeout', () => {
    const view = describeFreenetJoinWait({
      elapsedMs: FREENET_JOIN_WAIT_OPENNET_MS,
      holdOff: false,
      offline: false,
      host: host({
        mode: 'attached',
        leftover: 'android-node',
        nodeRing: { peers: [], peerCount: 0, peerSource: 'none' },
      }),
      polled: true,
    });
    expect(view.detail).toMatch(/Freenet Android Node/);
    expect(view.detail).toMatch(/cannot force-stop/);
    expect(view.detail).toMatch(/this device/);
    expect(view.detail).not.toMatch(/tablet/i);
    expect(view.detail).not.toMatch(/LAN hub/);
  });
});

describe('waitForFreenetJoinOpennet', () => {
  it('emits connecting (not error) before the first poll, then succeeds at N≥1', async () => {
    const seen: string[] = [];
    let ensureCount = 0;
    const result = await waitForFreenetJoinOpennet({
      timeoutMs: 1_000,
      pollMs: 10,
      isHoldOff: () => false,
      isOffline: () => false,
      ensureHost: async () => {
        ensureCount += 1;
      },
      readHost: async () =>
        host({ nodeRing: { peers: [], peerCount: 1, peerSource: 'count' } }),
      onProgress: (view) => seen.push(`${view.phase}:${view.tone}`),
    });
    expect(seen[0]).toBe('connecting:wait');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.wait.phase).toBe('ready');
    expect(ensureCount).toBeGreaterThanOrEqual(1);
  });

  it('times out when N stays 0', async () => {
    let t = 0;
    const result = await waitForFreenetJoinOpennet({
      timeoutMs: 40,
      pollMs: 20,
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
      isHoldOff: () => false,
      isOffline: () => false,
      ensureHost: async () => undefined,
      readHost: async () =>
        host({ nodeRing: { peers: [], peerCount: 0, peerSource: 'none' } }),
    });
    expect(result.ok).toBe(false);
    expect(result.wait.phase).toBe('timeout');
    expect(result.wait.label).toBe(FREENET_JOIN_TIMEOUT_LABEL);
  });

  it('returns hold-off without waiting for Opennet', async () => {
    let ensureCount = 0;
    const result = await waitForFreenetJoinOpennet({
      isHoldOff: () => true,
      isOffline: () => false,
      ensureHost: async () => {
        ensureCount += 1;
      },
      readHost: async () => {
        throw new Error('should not poll');
      },
    });
    expect(result.ok).toBe(false);
    expect(result.wait.phase).toBe('hold-off');
    expect(ensureCount).toBe(0);
  });
});
