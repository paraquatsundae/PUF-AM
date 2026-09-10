/**
 * Pure reconciler for the Freenet network pack (Plans/NETWORK_PACK_PLUGIN.md
 * § Enable semantics): starts the node when a farm wants it, only stops a node
 * it started, and never throws at the caller.
 */

import { describe, expect, it, vi } from 'vitest';

import type { FreenetHostStatus } from '../units/puf-freenet-host/src/types.ts';
import {
  createFreenetHostReconciler,
  nodeIsUp,
  type FreenetHostDeps,
} from '../plugins/freenet_host/src/freenetHostReconcile.ts';

function status(mode: FreenetHostStatus['mode']): FreenetHostStatus {
  return {
    hostId: 'h',
    mode,
    reachable: mode === 'managed' || mode === 'attached',
    wsUrl: 'ws://127.0.0.1:7509',
    wsHost: '127.0.0.1',
    wsPort: 7509,
  } as FreenetHostStatus;
}

function deps(initial: FreenetHostStatus['mode']) {
  let mode = initial;
  const d: FreenetHostDeps & { calls: string[] } = {
    calls: [],
    host: {
      status: vi.fn(async () => {
        d.calls.push('status');
        return status(mode);
      }),
      start: vi.fn(async () => {
        d.calls.push('host.start');
        mode = 'managed';
        return status(mode);
      }),
      stop: vi.fn(async () => {
        d.calls.push('host.stop');
        mode = 'stopped';
        return status(mode);
      }),
    },
    peer: {
      start: vi.fn(async () => {
        d.calls.push('peer.start');
      }),
      stop: vi.fn(async () => {
        d.calls.push('peer.stop');
      }),
    },
    onError: vi.fn(),
  };
  return d;
}

describe('nodeIsUp', () => {
  it('counts managed and attached, nothing else', () => {
    expect(nodeIsUp(status('managed'))).toBe(true);
    expect(nodeIsUp(status('attached'))).toBe(true);
    expect(nodeIsUp(status('stopped'))).toBe(false);
    expect(nodeIsUp(status('starting'))).toBe(false);
    expect(nodeIsUp(null)).toBe(false);
  });
});

describe('createFreenetHostReconciler', () => {
  it('starts node then peer when wanted and nothing is up, and stops both when unwanted', async () => {
    const d = deps('stopped');
    const r = createFreenetHostReconciler(d);
    await r.reconcile(true);
    expect(d.calls).toEqual(['status', 'host.start', 'peer.start']);
    expect(r.state.startedHere).toBe(true);
    await r.reconcile(false);
    expect(d.calls.slice(3)).toEqual(['peer.stop', 'host.stop']);
    expect(r.state.startedHere).toBe(false);
  });

  it('rides a node somebody else started and never stops it', async () => {
    const d = deps('attached');
    const r = createFreenetHostReconciler(d);
    await r.reconcile(true);
    expect(d.calls).toEqual(['status', 'peer.start']);
    expect(r.state.startedHere).toBe(false);
    await r.reconcile(false);
    expect(d.host.stop).not.toHaveBeenCalled();
    expect(d.peer.stop).not.toHaveBeenCalled();
  });

  it('is idempotent: reconcile(true) twice starts once', async () => {
    const d = deps('stopped');
    const r = createFreenetHostReconciler(d);
    await r.reconcile(true);
    await r.reconcile(true);
    expect(d.host.start).toHaveBeenCalledTimes(1);
    expect(d.peer.start).toHaveBeenCalledTimes(2);
  });

  it('does not own a node whose start did not come up', async () => {
    const d = deps('stopped');
    d.host.start = vi.fn(async () => status('failed'));
    const r = createFreenetHostReconciler(d);
    await r.reconcile(true);
    expect(r.state.startedHere).toBe(false);
    expect(d.peer.start).not.toHaveBeenCalled();
  });

  it('reports failures through onError instead of throwing', async () => {
    const d = deps('stopped');
    d.host.start = vi.fn(async () => {
      throw new Error('spawn failed');
    });
    const r = createFreenetHostReconciler(d);
    await expect(r.reconcile(true)).resolves.toBeUndefined();
    expect(d.onError).toHaveBeenCalledWith('start', expect.any(Error));
  });
});
