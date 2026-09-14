/**
 * Page bus + transport tap: host/IPC put/get → ring event.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  recordFreenetContractTraffic,
  resetFreenetContractTrafficForTests,
  recentFreenetContractTraffic,
  tapFreenetContractTraffic,
} from '../src/lib/freenetContractTraffic';
import type { FreenetPackTransport } from '../src/mist/freenetPackTransport.ts';

afterEach(() => {
  resetFreenetContractTrafficForTests();
});

function stubTransport(): FreenetPackTransport {
  return {
    kind: 'host',
    async peerStatus() {
      return {
        running: true,
        connected: true,
        contribute: false,
        backendId: 't',
        transportId: 'ws02',
        transportLabel: 't',
        freenet: 'connected',
        rootDir: '',
      };
    },
    async peerStart() {
      return this.peerStatus();
    },
    async peerStop() {
      return this.peerStatus();
    },
    async peerSetContribute() {
      return this.peerStatus();
    },
    async publishBlob(input) {
      return {
        storageKey: input.storageKey,
        contentHash: input.contentHash,
        freenetUri: 'FN02@hot',
        publishedAt: '2026-09-14T11:00:00.000Z',
      };
    },
    async hotRecord() {
      return null;
    },
    async pullHot() {
      return {
        storageKey: 'mist/v1/farm/f1/hot/current',
        ciphertext: new Uint8Array([1]),
        contentHash: 'aa',
        freenetUri: 'FN02@hot',
      };
    },
    async pullByUri(input) {
      return {
        storageKey: input.storageKey,
        ciphertext: new Uint8Array([1]),
        contentHash: input.contentHash || 'bb',
        freenetUri: input.freenetUri,
      };
    },
    async slotPublish(input) {
      return {
        uri: 'FN02@watch',
        instanceIdBase58: input.instanceIdBase58,
        mode: 'put',
        publishedAt: '2026-09-14T11:00:00.000Z',
      };
    },
    async slotRead(id) {
      return new TextEncoder().encode(id);
    },
  };
}

describe('recordFreenetContractTraffic', () => {
  it('records a host PUT as Sent Hot', () => {
    recordFreenetContractTraffic({
      op: 'put',
      source: 'host',
      slotKind: 'hot',
      contractKey: 'FN02@hot',
    });
    const recent = recentFreenetContractTraffic();
    expect(recent[0]).toMatchObject({ label: 'Sent Hot', direction: 'out', source: 'host' });
  });
});

describe('tapFreenetContractTraffic', () => {
  it('turns a pack PUT / watch GET into ring events', async () => {
    const tapped = tapFreenetContractTraffic(stubTransport());
    await tapped.publishBlob({
      farmId: 'f1',
      kind: 'hot',
      storageKey: 'mist/v1/farm/f1/hot/current',
      ciphertext: new Uint8Array([1]),
      contentHash: 'aa',
    });
    await tapped.slotRead('watch-slot', { trafficKind: 'watch' });
    const recent = recentFreenetContractTraffic();
    expect(recent.map((row) => row.label).sort()).toEqual(['Fetched watch', 'Sent Hot']);
  });
});
