/**
 * In-process Freenet peer plug-in — FCP transport + FreenetMistStore lifecycle.
 *
 * Node-only (`node:net`, `node:fs`). Browser code talks to a server-hosted peer
 * via authenticated local API routes; import status types from `./index.ts`.
 *
 * Future fork boundary for PUF-FN — keep this module narrow.
 */

import path from 'node:path';

import { FcpFreenetTransport } from './fcp-freenet-transport.ts';
import { FreenetMistStore } from './freenet-mist-store.ts';
import type { FreenetTransport } from './freenet-transport.ts';
import type { MistHealth, MistStats } from './types.ts';

export type FreenetPeerStatus = {
  /** Peer host started (store initialized; transport may still be disconnected). */
  running: boolean;
  connected: boolean;
  contribute: boolean;
  backendId: string;
  freenet: 'connected' | 'disconnected' | 'connecting';
  host?: string;
  port?: number;
  nodeVersion?: string;
  rootDir: string;
  freenetPendingInserts?: number;
  freenetIndexedKeys?: number;
  lastError?: string;
};

export type FreenetPeerOptions = {
  rootDir: string;
  /** When omitted, uses FcpFreenetTransport (Hyphanet localhost:9481). */
  transport?: FreenetTransport;
  contribute?: boolean;
  /** Attempt TCP connect on start (default true). */
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
  const transport = options.transport ?? new FcpFreenetTransport();
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
    return {
      running,
      connected: health.freenet === 'connected',
      contribute: health.contribute,
      backendId: health.backendId,
      freenet: health.freenet ?? 'disconnected',
      host: transportHealth.host,
      port: transportHealth.port,
      nodeVersion: transportHealth.nodeVersion,
      rootDir,
      freenetPendingInserts: stats?.freenetPendingInserts,
      freenetIndexedKeys: stats?.freenetIndexedKeys,
      lastError,
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
