/**
 * Node-only mist-freenet entry — disk + Freenet backends.
 *
 * Electron main / workshop tests import from here. Browser bundles should
 * use `./index.ts` only.
 */

export {
  DEFAULT_FREENET_WS_URL,
  DiskMistStore,
  Freenet02WsTransport,
  FreenetMistStore,
  MistStorageFullError,
  MockFreenetTransport,
  createFreenetPeer,
  createFreenetTransport,
  describeFreenetTransportKind,
  encodeFreenet02Uri,
  loadSlotContractWasm,
  mockChkUriFromContent,
  putJoinSlotNative,
  resolveSlotContractWasmPath,
} from './freenet.ts';
export type {
  DiskMistStoreOptions,
  Freenet02WsTransportOptions,
  CreateFreenetTransportOptions,
  FreenetTransportKind,
  FreenetKeyIndex,
  FreenetKeyRecord,
  FreenetMistStoreOptions,
  FreenetOutboxEntry,
  FreenetPeer,
  FreenetPeerOptions,
  FreenetPeerStatus,
  FreenetPutOptions,
  FreenetPutResult,
  FreenetTransport,
  FreenetTransportHealth,
  MockFreenetTransportOptions,
  PutJoinSlotOptions,
  SlotPutResult,
} from './freenet.ts';
