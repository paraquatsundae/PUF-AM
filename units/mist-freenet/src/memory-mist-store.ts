/**
 * In-memory MistStore — phase 1 contract validation only.
 * Not durable; no Freenet wire.
 */

import { keyMatchesPrefix } from './keys.ts';
import { sha256Hex } from './hash.ts';
import type { MistStore } from './mist-store.ts';
import type {
  MistEntry,
  MistHealth,
  MistMeta,
  MistPutMeta,
  MistStats,
  PutResult,
  Unsubscribe,
  WatchCallback,
} from './types.ts';

export type MemoryMistStoreOptions = {
  backendId?: string;
  /** Default false — mobile peer policy (Plans § Mobile peer policy). */
  contribute?: boolean;
};

export class MemoryMistStore implements MistStore {
  readonly backendId: string;
  private contribute: boolean;
  private readonly entries = new Map<string, MistEntry>();
  private readonly watchers = new Map<string, Set<WatchCallback>>();

  constructor(options: MemoryMistStoreOptions = {}) {
    this.backendId = options.backendId ?? 'memory';
    this.contribute = options.contribute ?? false;
  }

  async put(key: string, ciphertext: Uint8Array, meta: MistPutMeta): Promise<PutResult> {
    const ts = meta.ts ?? Date.now();
    const size = meta.size ?? ciphertext.byteLength;
    const content_hash = meta.content_hash ?? sha256Hex(ciphertext);

    const fullMeta: MistMeta = {
      kind: meta.kind,
      content_hash,
      size,
      ts,
      ...(meta.version !== undefined ? { version: meta.version } : {}),
      ...(meta.period !== undefined ? { period: meta.period } : {}),
    };

    const entry: MistEntry = { key, ciphertext, meta: fullMeta };
    this.entries.set(key, entry);
    this.notifyWatchers(key, entry);

    return { key, contentHash: content_hash, size, ts };
  }

  async get(key: string): Promise<MistEntry | null> {
    return this.entries.get(key) ?? null;
  }

  async list(prefix: string): Promise<MistEntry[]> {
    const out: MistEntry[] = [];
    for (const entry of this.entries.values()) {
      if (keyMatchesPrefix(entry.key, prefix)) out.push(entry);
    }
    out.sort((a, b) => a.key.localeCompare(b.key));
    return out;
  }

  watch(key: string, cb: WatchCallback): Unsubscribe {
    let set = this.watchers.get(key);
    if (!set) {
      set = new Set();
      this.watchers.set(key, set);
    }
    set.add(cb);

    const current = this.entries.get(key);
    queueMicrotask(() => cb(current ?? null));

    return () => {
      set!.delete(cb);
      if (set!.size === 0) this.watchers.delete(key);
    };
  }

  setContribute(enabled: boolean): void {
    this.contribute = enabled;
  }

  getContribute(): boolean {
    return this.contribute;
  }

  async health(): Promise<MistHealth> {
    return { ok: true, backendId: this.backendId, contribute: this.contribute };
  }

  async stats(): Promise<MistStats> {
    let diskUsedBytes = 0;
    for (const entry of this.entries.values()) {
      diskUsedBytes += entry.meta.size;
    }
    return {
      backendId: this.backendId,
      contribute: this.contribute,
      diskUsedBytes,
      entryCount: this.entries.size,
    };
  }

  private notifyWatchers(key: string, entry: MistEntry): void {
    const set = this.watchers.get(key);
    if (!set) return;
    for (const cb of set) cb(entry);
  }
}
