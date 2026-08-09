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

export type { FarmCodeSpec, ParsedFarmCode } from './farm-code.ts';
export {
  FarmCodeError,
  FARM_CODE_BODY_LEN,
  FARM_CODE_ENTROPY_BITS,
  FARM_CODE_LEGACY_BODY_LEN,
  FARM_CODE_LEGACY_VERSION,
  FARM_CODE_PAYLOAD_LEN,
  FARM_CODE_RAW_BYTES,
  FARM_CODE_SPECS,
  FARM_CODE_VERSION,
  decodeFarmCodeBytes,
  deriveFarmId,
  deriveFarmSeed,
  encodeFarmCodeFromBytes,
  farmCodeSymbolCount,
  farmCodeVersionForBody,
  formatFarmCode,
  formatFarmCodeInput,
  isValidFarmCode,
  mintFarmCode,
  normalizeFarmCodeInput,
  parseFarmCode,
} from './farm-code.ts';

export { bytesToHex, hexToBytes, hkdfSha256, MIST_HKDF_SALT } from './farm-seed.ts';
export { getSubtleCrypto, hasSubtleCrypto } from './subtle-crypto.ts';

export {
  HOT_CONTRACT_HKDF_INFO,
  deriveHotContractKey,
  decryptHotBlob,
  encryptHotBlob,
  type HotCiphertextEnvelope,
} from './hot-crypto.ts';

export {
  BONES_CONTRACT_HKDF_INFO,
  deriveBonesContractKey,
  decryptBonesBlob,
  encryptBonesBlob,
  type BonesCiphertextEnvelope,
} from './bones-crypto.ts';

export {
  JOIN_SLOT_HEADER_BYTES,
  JOIN_SLOT_ID_BYTES,
  JOIN_SLOT_ID_HKDF_INFO_PREFIX,
  JOIN_SLOT_MAGIC,
  JOIN_SLOT_MAX_PAYLOAD_BYTES,
  JOIN_SLOT_PARAMETERS_BYTES,
  JOIN_SLOT_SIGNING_KEY_HKDF_INFO,
  JOIN_SLOT_VERIFYING_KEY_BYTES,
  JoinSlotStateError,
  SLOT_CONTRACT_CODE_HASH_B58,
  decodeJoinSlotState,
  deriveJoinSlotAddress,
  deriveJoinSlotId,
  deriveJoinSlotSigningSeed,
  deriveJoinSlotVerifyingKey,
  encodeJoinSlotState,
  joinSlotInstanceId,
  joinSlotParameters,
  joinSlotSequence,
  slotContractCodeHashBytes,
} from './freenet02-slot.ts';
export type {
  DecodedJoinSlotState,
  EncodeJoinSlotStateInput,
  JoinSlotAddress,
} from './freenet02-slot.ts';

export {
  JOIN_SLOT_MANIFEST_HKDF_INFO_PREFIX,
  decryptJoinSlotManifest,
  deriveJoinSlotManifestKey,
  encryptJoinSlotManifest,
} from './join-slot-crypto.ts';
export type { JoinSlotCiphertextEnvelope } from './join-slot-crypto.ts';

export type { FreenetPeerStatus } from './freenet-peer.ts';

export { isMistAeadEnvelope, assertCiphertextForFreenet } from './ciphertext-guard.ts';
export type { AssertCiphertextOptions } from './ciphertext-guard.ts';
