/**
 * MistStore — encrypted blob storage contract for the mist unit (phase 1).
 *
 * Backends (memory, local fake Freenet, real Freenet) implement this interface.
 * Ciphertext is opaque to the store; encryption happens above this layer.
 */

import type {
  MistEntry,
  MistHealth,
  MistPutMeta,
  MistStats,
  PutResult,
  Unsubscribe,
  WatchCallback,
} from './types.ts';

export interface MistStore {
  /** Store sealed bytes at `key`. Computes content_hash when omitted. */
  put(key: string, ciphertext: Uint8Array, meta: MistPutMeta): Promise<PutResult>;

  /** Fetch one entry or null when missing. */
  get(key: string): Promise<MistEntry | null>;

  /** All entries whose keys start with `prefix`. */
  list(prefix: string): Promise<MistEntry[]>;

  /**
   * Subscribe to changes for one key. Implementations may stub with no-op
   * unsubscribe until a real backend supports push/watch.
   */
  watch(key: string, cb: WatchCallback): Unsubscribe;

  /** Opt in/out of hosting replicated mist contracts for other peers. */
  setContribute(enabled: boolean): void;

  getContribute(): boolean;

  health(): Promise<MistHealth>;

  stats(): Promise<MistStats>;
}
