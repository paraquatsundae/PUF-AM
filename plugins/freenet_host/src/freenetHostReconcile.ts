/**
 * Reconcile the device's Freenet node with the farm that is open.
 *
 * Plans/NETWORK_PACK_PLUGIN.md § Enable semantics: one node per device, enabled
 * per farm. When the open farm has the pack enabled and this shell has a host
 * capability, the node should be up and the Express peer talking to it; when
 * the farm is switched off, or a farm without the pack opens, the node this
 * reconciler started is stopped. It never stops a node it did not start — the
 * operator's own Connect / Start buttons and the desktop mist preference keep
 * their node, and an `attached` node was never ours to kill.
 *
 * Pure apart from the injected shell calls, so it is tested without Electron.
 * Serialized: a flurry of `want` changes resolves in order, last one wins.
 */

import type { FreenetHostStatus } from '../../../units/puf-freenet-host/src/types.ts';

export type FreenetHostDeps = {
  host: {
    status(): Promise<FreenetHostStatus | null>;
    start(): Promise<FreenetHostStatus | null>;
    stop(): Promise<FreenetHostStatus | null>;
  };
  peer: {
    start(): Promise<unknown>;
    stop(): Promise<unknown>;
  };
  /** Sink for best-effort failures; the reconciler itself never throws. */
  onError?(stage: 'status' | 'start' | 'stop', error: unknown): void;
};

export type FreenetHostReconcilerState = {
  /** The node is up because this reconciler started it. */
  startedHere: boolean;
};

export function nodeIsUp(status: FreenetHostStatus | null | undefined): boolean {
  return status?.mode === 'managed' || status?.mode === 'attached';
}

export function createFreenetHostReconciler(deps: FreenetHostDeps) {
  const state: FreenetHostReconcilerState = { startedHere: false };
  let chain: Promise<void> = Promise.resolve();

  async function bringUp(): Promise<void> {
    let status: FreenetHostStatus | null = null;
    try {
      status = await deps.host.status();
    } catch (error) {
      deps.onError?.('status', error);
    }
    if (nodeIsUp(status)) {
      // Somebody else's node (Connect button, mist preference, sideloaded). Ride it, don't own it.
      try {
        await deps.peer.start();
      } catch (error) {
        deps.onError?.('start', error);
      }
      return;
    }
    try {
      const after = await deps.host.start();
      if (!nodeIsUp(after)) return;
      state.startedHere = true;
      await deps.peer.start();
    } catch (error) {
      deps.onError?.('start', error);
    }
  }

  async function takeDown(): Promise<void> {
    if (!state.startedHere) return;
    state.startedHere = false;
    try {
      await deps.peer.stop();
    } catch (error) {
      deps.onError?.('stop', error);
    }
    try {
      await deps.host.stop();
    } catch (error) {
      deps.onError?.('stop', error);
    }
  }

  return {
    /** Read-only view for tests and the workshop card. */
    get state(): Readonly<FreenetHostReconcilerState> {
      return state;
    },
    /** Move toward `want`; resolves when this step has been applied. */
    reconcile(want: boolean): Promise<void> {
      chain = chain.then(() => (want ? bringUp() : takeDown()));
      return chain;
    },
  };
}

export type FreenetHostReconciler = ReturnType<typeof createFreenetHostReconciler>;
