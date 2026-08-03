/**
 * In-process Freenet peer plug-in — FCP transport + FreenetMistStore lifecycle.
 *
 * Node-only (`node:net`, `node:fs`). Browser code talks to a server-hosted peer
 * via authenticated local API routes; import status types from `./index.ts`.
 *
 * Future fork boundary for PUF-FN — keep this module narrow.
 */

import path from 'node:path';

import { createFreenetTransport, describeFreenetTransportKind, resolveFreenetTransportKind } from './create-freenet-transport.ts';
import { FreenetMistStore } from './freenet-mist-store.ts';
import type { FreenetTransport } from './freenet-transport.ts';
import type { MistHealth, MistStats } from './types.ts';

export type FreenetPeerStatus = {
  /** Peer host started (store initialized; transport may still be disconnected). */
  running: boolean;
  connected: boolean;
  contribute: boolean;
  backendId: string;
  /** Wire backend: fcp | ws02 | mock */
  transportId?: string;
  /** Human label, e.g. Freenet 0.2 WebSocket vs Hyphanet FCP */
  transportLabel?: string;
  freenet: 'connected' | 'disconnected' | 'connecting';
  host?: string;
  port?: number;
  /** Full endpoint (WS URL or host:port summary). */
  endpoint?: string;
  nodeVersion?: string;
  rootDir: string;
  freenetPendingInserts?: number;
  freenetIndexedKeys?: number;
  lastError?: string;
};

export type FreenetPeerOptions = {
  rootDir: string;
  /** When omitted, uses env-selected transport (FCP or Freenet 0.2 WS). */
  transport?: FreenetTransport;
  contribute?: boolean;
  /** Attempt connect on start (default true). */
  connectOnStart?: boolean;
  /** Skip encrypt-before-upload guard (vitest only). */
  allowPlaintextForTests?: boolean;
  backendId?: string;
};

export type FreenetPeer = {
  start(): Promise<FreenetPeerStatus>;
  stop(): Promise<FreenetPeerStatus>;
  status(): Promise<FreenetPeerStatus>;
  getStore(): FreenetMistStore;
  setContribute(enabled: boolean): void;
  flushOutbox(): Promise<number>;
};

export function createFreenetPeer(options: FreenetPeerOptions): FreenetPeer {
  if (!options.rootDir) {
    throw new Error('createFreenetPeer: rootDir is required');
  }

  const rootDir = path.resolve(options.rootDir);
  const transportKind = resolveFreenetTransportKind();
  const transport = options.transport ?? createFreenetTransport();
  const connectOnStart = options.connectOnStart ?? true;
  let running = false;
  let lastError: string | undefined;

  const store = new FreenetMistStore({
    rootDir,
    transport,
    contribute: options.contribute ?? false,
    connectOnInit: false,
    backendId: options.backendId ?? 'freenet-peer',
    allowPlaintextForTests: options.allowPlaintextForTests ?? false,
  });

  async function buildStatus(health: MistHealth, stats?: MistStats): Promise<FreenetPeerStatus> {
    const transportHealth = await transport.health();
    const tid = transportHealth.transportId ?? transportKind;
    return {
      running,
      connected: health.freenet === 'connected',
      contribute: health.contribute,
      backendId: health.backendId,
      transportId: tid,
      transportLabel: describeFreenetTransportKind(tid === 'ws02' ? 'ws02' : 'fcp'),
      freenet: health.freenet ?? 'disconnected',
      host: transportHealth.host,
      port: transportHealth.port,
      endpoint: transportHealth.endpoint,
      nodeVersion: transportHealth.nodeVersion,
      rootDir,
      freenetPendingInserts: stats?.freenetPendingInserts,
      freenetIndexedKeys: stats?.freenetIndexedKeys,
      lastError: lastError ?? transportHealth.lastError,
    };
  }

  return {
    async start() {
      await store.init();
      running = true;
      lastError = undefined;

      if (connectOnStart) {
        try {
          await transport.connect();
          await store.flushOutbox();
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
        }
      }

      const health = await store.health();
      const stats = await store.stats();
      return buildStatus(health, stats);
    },

    async stop() {
      running = false;
      try {
        await transport.disconnect();
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
      const health = await store.health();
      return buildStatus(health);
    },

    async status() {
      const health = await store.health();
      const stats = running ? await store.stats() : undefined;
      return buildStatus(health, stats);
    },

    getStore() {
      return store;
    },

    setContribute(enabled: boolean) {
      store.setContribute(enabled);
    },

    flushOutbox() {
      return store.flushOutbox();
    },
  };
}
