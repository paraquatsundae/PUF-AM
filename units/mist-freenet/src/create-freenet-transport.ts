/**
 * Select Freenet wire backend from environment.
 *
 * | Env | Effect |
 * |-----|--------|
 * | _(unset)_ | **Freenet 0.2 WebSocket** @ `ws://127.0.0.1:7509/v1/contract/command` (workshop default) |
 * | `FREENET_TRANSPORT=ws02` / `ws` / `freenet02` | Freenet 0.2 WebSocket |
 * | `FREENET_WS_URL=ws://…` | Implies ws02 when transport unset |
 * | `FREENET_TRANSPORT=fcp` / `hyphanet` | Hyphanet FCP :9481 (legacy opt-in) |
 */

/** Default Freenet 0.2 node WebSocket endpoint (Rust `freenet network` ws-api-port). */
export const DEFAULT_FREENET_WS_URL = 'ws://127.0.0.1:7509/v1/contract/command';

import { FcpFreenetTransport, type FcpFreenetTransportOptions } from './fcp-freenet-transport.ts';
import { Freenet02WsTransport, type Freenet02WsTransportOptions } from './freenet02-ws-transport.ts';
import type { FreenetTransport } from './freenet-transport.ts';

export type FreenetTransportKind = 'fcp' | 'ws02';

export type CreateFreenetTransportOptions = {
  kind?: FreenetTransportKind;
  fcp?: FcpFreenetTransportOptions;
  ws02?: Freenet02WsTransportOptions;
};

export function resolveFreenetTransportKind(
  env: NodeJS.ProcessEnv = process.env,
): FreenetTransportKind {
  const explicit = env.FREENET_TRANSPORT?.trim().toLowerCase();
  if (explicit === 'ws02' || explicit === 'ws' || explicit === 'freenet02') return 'ws02';
  if (explicit === 'fcp' || explicit === 'hyphanet') return 'fcp';

  if (env.FREENET_WS_URL?.trim()) return 'ws02';

  return 'ws02';
}

export function createFreenetTransport(options: CreateFreenetTransportOptions = {}): FreenetTransport {
  const kind = options.kind ?? resolveFreenetTransportKind();
  if (kind === 'ws02') {
    return new Freenet02WsTransport(options.ws02);
  }
  return new FcpFreenetTransport(options.fcp);
}

export function describeFreenetTransportKind(kind: FreenetTransportKind): string {
  return kind === 'ws02' ? 'Freenet 0.2 WebSocket' : 'Hyphanet FCP';
}
