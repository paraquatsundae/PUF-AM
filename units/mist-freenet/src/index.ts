/**
 * @pufam/mist-freenet — browser-safe public surface.
 *
 * Node-only disk backend: import from `./node.ts`.
 */

export type {
  FarmStoreAdapter,
  FarmStoreBackendId,
  FarmStoreFactory,
} from './farm-store.ts';
export { createFarmStoreAdapter } from './farm-store.ts';

export type { MistStore } from './mist-store.ts';

export type {
  MistEntry,
  MistHealth,
  MistKind,
  MistMeta,
  MistPutMeta,
  MistStats,
  PutResult,
  Unsubscribe,
  WatchCallback,
} from './types.ts';
export { MIST_KINDS } from './types.ts';

export type { ParsedMistKey } from './keys.ts';
export {
  MIST_KEY_VERSION,
  archiveKey,
  bonesKey,
  farmKeyPrefix,
  hotKey,
  keyMatchesPrefix,
  kindPrefix,
  manifestKey,
  parseMistKey,
} from './keys.ts';

export { MemoryMistStore } from './memory-mist-store.ts';
export type { MemoryMistStoreOptions } from './memory-mist-store.ts';

export { IndexedDbMistStore } from './indexeddb-mist-store.ts';
export type { IndexedDbMistStoreOptions } from './indexeddb-mist-store.ts';

export { sealHotPeriod } from './seal-hot.ts';
export type {
  ArchiveState,
  HotRecord,
  HotState,
  ManifestArchiveEntry,
  ManifestState,
  SealHotPeriodOptions,
  SealHotPeriodResult,
} from './seal-hot.ts';

export { MistStorageFullError } from './errors.ts';

export { sha256Hex } from './hash.ts';

export type { ParsedFarmCode } from './farm-code.ts';
export {
  FarmCodeError,
  FARM_CODE_RAW_BYTES,
  FARM_CODE_VERSION,
  decodeFarmCodeBytes,
  deriveFarmId,
  deriveFarmSeed,
  encodeFarmCodeFromBytes,
  formatFarmCode,
  isValidFarmCode,
  mintFarmCode,
  normalizeFarmCodeInput,
  parseFarmCode,
} from './farm-code.ts';

export { bytesToHex, hexToBytes, hkdfSha256, MIST_HKDF_SALT } from './farm-seed.ts';
export { getSubtleCrypto, hasSubtleCrypto } from './subtle-crypto.ts';
