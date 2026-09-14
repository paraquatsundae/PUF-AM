/**
 * Page-side Freenet contract traffic — host/transport callbacks + last N.
 *
 * Pure helpers live in `units/puf-freenet-host/src/contract-traffic.ts`.
 * This file is the in-page bus the Settings ring hook listens to.
 * Plans/FREENET_NETWORK_PACK.md Decision — 2026-09-14 (Settings Freenet traffic).
 */

import type { FreenetPackTransport } from '../mist/freenetPackTransport.ts';
import {
  createFreenetContractTrafficEvent,
  mergeFreenetContractTraffic,
  slotKindFromStorageKey,
  visibleFreenetContractTraffic,
  type FreenetContractSlotKind,
  type FreenetContractTrafficEvent,
} from '../../units/puf-freenet-host/src/contract-traffic.ts';

export {
  FREENET_CONTRACT_TRAFFIC_FADE_MS,
  FREENET_CONTRACT_TRAFFIC_MAX,
  asFreenetContractTrafficList,
  createFreenetContractTrafficEvent,
  freenetContractTrafficLabel,
  mergeFreenetContractTraffic,
  slotKindFromStorageKey,
  visibleFreenetContractTraffic,
} from '../../units/puf-freenet-host/src/contract-traffic.ts';

export type {
  FreenetContractOp,
  FreenetContractSlotKind,
  FreenetContractTrafficEvent,
} from '../../units/puf-freenet-host/src/contract-traffic.ts';

type Listener = (event: FreenetContractTrafficEvent) => void;

const listeners = new Set<Listener>();
let recent: FreenetContractTrafficEvent[] = [];

export function recordFreenetContractTraffic(
  input: Parameters<typeof createFreenetContractTrafficEvent>[0],
): FreenetContractTrafficEvent {
  const event = createFreenetContractTrafficEvent({ ...input, source: input.source ?? 'host' });
  recent = mergeFreenetContractTraffic([event, ...recent]);
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      /* a bad subscriber must not break put/get */
    }
  }
  return event;
}

export function subscribeFreenetContractTraffic(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function recentFreenetContractTraffic(nowMs = Date.now()): FreenetContractTrafficEvent[] {
  return mergeFreenetContractTraffic(recent, nowMs);
}

export function resetFreenetContractTrafficForTests(): void {
  recent = [];
  listeners.clear();
}

/** After a successful host/relay call — labels when we know the slot kind. */
export function tapFreenetContractTraffic(transport: FreenetPackTransport): FreenetPackTransport {
  return {
    ...transport,
    async publishBlob(input) {
      const result = await transport.publishBlob(input);
      recordFreenetContractTraffic({
        op: 'put',
        source: 'host',
        slotKind: slotKindFromStorageKey(input.storageKey),
        contractKey: result.freenetUri,
      });
      return result;
    },
    async pullHot(farmId) {
      const result = await transport.pullHot(farmId);
      recordFreenetContractTraffic({
        op: 'get',
        source: 'host',
        slotKind: 'hot',
        contractKey: result.freenetUri,
      });
      return result;
    },
    async pullByUri(input) {
      const result = await transport.pullByUri(input);
      recordFreenetContractTraffic({
        op: 'get',
        source: 'host',
        slotKind: slotKindFromStorageKey(input.storageKey),
        contractKey: result.freenetUri ?? input.freenetUri,
      });
      return result;
    },
    async slotPublish(input) {
      const result = await transport.slotPublish(input);
      recordFreenetContractTraffic({
        op: 'put',
        source: 'host',
        slotKind: (input.trafficKind ?? 'unknown') as FreenetContractSlotKind,
        contractKey: result.uri,
      });
      return result;
    },
    async slotRead(instanceIdBase58, options) {
      const result = await transport.slotRead(instanceIdBase58, options);
      recordFreenetContractTraffic({
        op: 'get',
        source: 'host',
        slotKind: options?.trafficKind ?? 'unknown',
        contractKey: instanceIdBase58,
      });
      return result;
    },
  };
}
