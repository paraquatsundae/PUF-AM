/**
 * Frozen mist storage types (phase 1).
 * @see Plans/MIST_NETWORK_STORAGE.md
 */

/** Contract / asset kinds stored on mist. */
export const MIST_KINDS = ['bones', 'hot', 'archive', 'manifest'] as const;

export type MistKind = (typeof MIST_KINDS)[number];

/** Metadata stored alongside ciphertext blobs. */
export type MistMeta = {
  /** SHA-256 hex of sealed / ciphertext bytes. */
  content_hash: string;
  kind: MistKind;
  /** Ciphertext byte length. */
  size: number;
  /** Unix timestamp (ms) of last write. */
  ts: number;
  /** Monotonic map_version for bones; contract revision elsewhere. */
  version?: number;
  /** Archive calendar period, e.g. `"2026"`. */
  period?: string;
};

/** Partial meta accepted on put — hash, size, and ts may be computed by the store. */
export type MistPutMeta = Pick<MistMeta, 'kind'> &
  Partial<Pick<MistMeta, 'content_hash' | 'size' | 'ts' | 'version' | 'period'>>;

export type MistEntry = {
  key: string;
  ciphertext: Uint8Array;
  meta: MistMeta;
};

export type PutResult = {
  key: string;
  contentHash: string;
  size: number;
  ts: number;
};

export type MistHealth = {
  ok: boolean;
  backendId: string;
  contribute: boolean;
  /** Present on Freenet-backed stores — local Hyphanet node reachability. */
  freenet?: 'connected' | 'disconnected' | 'connecting';
};

export type MistStats = {
  backendId: string;
  contribute: boolean;
  diskUsedBytes: number;
  entryCount: number;
  /** Freenet outbox depth (inserts queued while node down). */
  freenetPendingInserts?: number;
  /** Mist keys with a Freenet URI mapping in the local index. */
  freenetIndexedKeys?: number;
};

export type WatchCallback = (entry: MistEntry | null) => void;

/** Returned from `watch()` — call to stop notifications. */
export type Unsubscribe = () => void;
