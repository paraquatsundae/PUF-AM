/**
 * Build the Freenet wire backend from the environment.
 *
 * There is one: the Freenet 0.2 WebSocket transport. `FREENET_WS_URL` moves it
 * off the default node address; `FREENET_WS_AUTH` adds a token. The legacy
 * Hyphanet FCP transport and the `FREENET_TRANSPORT` selector that reached it
 * were removed in Phase 2 of Plans/FREENET_NETWORK_PACK.md (2026-09-11) — the
 * kind is kept as a type so status payloads still name their backend.
 */

import { Freenet02WsTransport, type Freenet02WsTransportOptions } from './freenet02-ws-transport.ts';
import type { FreenetTransport } from './freenet-transport.ts';

/** Default Freenet 0.2 node WebSocket endpoint (Rust `freenet network` ws-api-port). */
export const DEFAULT_FREENET_WS_URL = 'ws://127.0.0.1:7509/v1/contract/command';

export type FreenetTransportKind = 'ws02';

export type CreateFreenetTransportOptions = {
  ws02?: Freenet02WsTransportOptions;
};

export function createFreenetTransport(options: CreateFreenetTransportOptions = {}): FreenetTransport {
  return new Freenet02WsTransport(options.ws02);
}

export function describeFreenetTransportKind(_kind: FreenetTransportKind = 'ws02'): string {
  return 'Freenet 0.2 WebSocket';
}
