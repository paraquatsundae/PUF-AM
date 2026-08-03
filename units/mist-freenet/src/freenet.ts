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
export { MockFreenetTransport, mockChkUriFromContent } from './mock-freenet-transport.ts';
export type { MockFreenetTransportOptions } from './mock-freenet-transport.ts';

export type { FreenetKeyRecord, FreenetKeyIndex, FreenetOutboxEntry } from './freenet-keys.ts';

export { MistStorageFullError } from './errors.ts';

export { createFreenetPeer } from './freenet-peer.ts';
export type { FreenetPeer, FreenetPeerOptions, FreenetPeerStatus } from './freenet-peer.ts';
