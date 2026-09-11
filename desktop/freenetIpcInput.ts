/**
 * Input validation for the `puf-freenet:put|get|slot-put|slot-get` IPC.
 *
 * The renderer is the only caller, but IPC arguments are still untrusted at the
 * process boundary: anything that reaches `FreenetHostPlugin` from here goes on
 * to spawn `fdev` or hit the node's WebSocket, so shapes and sizes are checked
 * in main before either happens (Plans/FREENET_NETWORK_PACK.md Phase 1 slice B).
 * Pure — no Electron import — so it is tested without a shell.
 *
 * What is *not* checked here: whether the bytes are ciphertext. That is the
 * wire's job (`server/freenetHostWire.ts` → `assertCiphertextForFreenet`), kept
 * there so the guard sits on the host itself and not on one of its callers.
 */

import { parseMistKey } from '../units/mist-freenet/src/keys.ts';
import { normalizeMistFreenetUri } from '../units/mist-freenet/src/freenet-uri-normalize.ts';
import { isJoinSlotInstanceId } from '../server/freenetSlotOps.ts';

/**
 * Hot and bones are KiB-class single blocks (Plans/FREENET_OPERATOR_FLOW.md
 * §9.2); this is a ceiling against a runaway caller, not a budget.
 */
export const FREENET_IPC_MAX_BLOB_BYTES = 8 * 1024 * 1024;
/** A slot state is a header plus one sealed join manifest. */
export const FREENET_IPC_MAX_SLOT_STATE_BYTES = 64 * 1024;
/** Slot parameters are exactly 64 bytes; the shape check downstream says so. */
export const FREENET_IPC_MAX_SLOT_PARAMETERS_BYTES = 1024;

/** Mist farm ids are opaque but never contain path separators or whitespace. */
const FARM_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export class FreenetIpcInputError extends Error {
  readonly code = 'FREENET_IPC_INPUT' as const;

  constructor(message: string) {
    super(message);
    this.name = 'FreenetIpcInputError';
  }
}

/**
 * Bytes as the renderer may hand them over: a `Uint8Array` (structured clone
 * keeps the type), a bare `ArrayBuffer`, or base64 text for callers that
 * serialised. Anything else, an empty payload, or one over `maxBytes` is refused.
 */
export function ipcBytes(value: unknown, what: string, maxBytes: number): Uint8Array {
  let bytes: Uint8Array;
  if (value instanceof Uint8Array) {
    bytes = value;
  } else if (value instanceof ArrayBuffer) {
    bytes = new Uint8Array(value);
  } else if (typeof value === 'string') {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
      throw new FreenetIpcInputError(`${what}: not base64`);
    }
    bytes = new Uint8Array(Buffer.from(value, 'base64'));
  } else {
    throw new FreenetIpcInputError(`${what}: expected bytes (Uint8Array, ArrayBuffer or base64)`);
  }
  if (bytes.byteLength === 0) throw new FreenetIpcInputError(`${what}: empty`);
  if (bytes.byteLength > maxBytes) {
    throw new FreenetIpcInputError(`${what}: ${bytes.byteLength} bytes exceeds the ${maxBytes}-byte cap`);
  }
  return bytes;
}

/**
 * The mist storage key a blob is published under. Optional on the wire — the
 * host only moves bytes — but when present it must be a real `mist/v1` key with
 * a sane farm id, because it becomes the guard's kind hint and a log label.
 */
export function ipcMistKey(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 512) {
    throw new FreenetIpcInputError('key: expected a mist storage key string');
  }
  const parsed = parseMistKey(value);
  if (!parsed || !FARM_ID_RE.test(parsed.farmId)) {
    throw new FreenetIpcInputError('key: not a mist/v1 farm key');
  }
  return value;
}

/** `FN02@…`, `CHK@…` or a bare base58 id — normalised to the form the wire reads. */
export function ipcFreenetUri(value: unknown): string {
  if (typeof value !== 'string' || value.length > 256) {
    throw new FreenetIpcInputError('uri: expected a Freenet URI string');
  }
  try {
    return normalizeMistFreenetUri(value);
  } catch (err) {
    throw new FreenetIpcInputError(`uri: ${err instanceof Error ? err.message : 'invalid'}`);
  }
}

export function ipcSlotInstanceId(value: unknown): string {
  if (!isJoinSlotInstanceId(value)) {
    throw new FreenetIpcInputError('instanceId: must be a base58 contract instance id');
  }
  return value;
}

export type FreenetIpcPutArgs = { bytes: Uint8Array; key?: string };

export function ipcPutArgs(value: unknown): FreenetIpcPutArgs {
  const input = (value ?? {}) as { bytes?: unknown; key?: unknown };
  const bytes = ipcBytes(input.bytes, 'bytes', FREENET_IPC_MAX_BLOB_BYTES);
  const key = ipcMistKey(input.key);
  return key ? { bytes, key } : { bytes };
}

export type FreenetIpcSlotPutArgs = {
  parameters: Uint8Array;
  state: Uint8Array;
  instanceIdBase58: string;
};

export function ipcSlotPutArgs(value: unknown): FreenetIpcSlotPutArgs {
  const input = (value ?? {}) as { parameters?: unknown; state?: unknown; instanceIdBase58?: unknown };
  return {
    parameters: ipcBytes(input.parameters, 'parameters', FREENET_IPC_MAX_SLOT_PARAMETERS_BYTES),
    state: ipcBytes(input.state, 'state', FREENET_IPC_MAX_SLOT_STATE_BYTES),
    instanceIdBase58: ipcSlotInstanceId(input.instanceIdBase58),
  };
}
