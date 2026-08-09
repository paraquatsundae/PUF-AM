/**
 * Node-only Freenet / FCP entry — phase 3 wire backends.
 *
 * Electron main / workshop tests import from here. Browser bundles use `./index.ts`.
 */

export { DiskMistStore } from './disk-mist-store.ts';
export type { DiskMistStoreOptions } from './disk-mist-store.ts';

export { FreenetMistStore } from './freenet-mist-store.ts';
export type { FreenetMistStoreOptions } from './freenet-mist-store.ts';

export type { FreenetTransport, FreenetPutOptions, FreenetPutResult, FreenetTransportHealth } from './freenet-transport.ts';
export { FcpFreenetTransport } from './fcp-freenet-transport.ts';
export type { FcpFreenetTransportOptions } from './fcp-freenet-transport.ts';
export { Freenet02WsTransport } from './freenet02-ws-transport.ts';
export type { Freenet02WsTransportOptions } from './freenet02-ws-transport.ts';
export {
  createFreenetTransport,
  describeFreenetTransportKind,
  resolveFreenetTransportKind,
} from './create-freenet-transport.ts';
export type { CreateFreenetTransportOptions, FreenetTransportKind } from './create-freenet-transport.ts';
export { encodeFreenet02Uri, parseFreenet02Uri, isFreenet02Uri, FREENET02_URI_PREFIX } from './freenet02-uri.ts';
export {
  InvalidFreenetUriError,
  normalizeMistFreenetUri,
} from './freenet-uri-normalize.ts';
export {
  blake3Bytes,
  loadPackContractWasm,
  packParametersFromBlob,
  FREENET02_MAX_BLOB_BYTES,
  DEFAULT_PACK_CONTRACT_WASM,
} from './freenet02-pack.ts';
export {
  DEFAULT_SLOT_CONTRACT_WASM,
  putJoinSlotViaFdev,
  resolveSlotContractWasmPath,
} from './freenet02-fdev-slot.ts';
export type { SlotPutResult } from './freenet02-fdev-slot.ts';
export { MockFreenetTransport, mockChkUriFromContent } from './mock-freenet-transport.ts';
export type { MockFreenetTransportOptions } from './mock-freenet-transport.ts';

export type { FreenetKeyRecord, FreenetKeyIndex, FreenetOutboxEntry } from './freenet-keys.ts';

export { MistStorageFullError } from './errors.ts';

export { createFreenetPeer } from './freenet-peer.ts';
export type { FreenetPeer, FreenetPeerOptions, FreenetPeerStatus } from './freenet-peer.ts';
