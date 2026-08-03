/**
 * IndexedDB-backed MistStore — browser durable persistence (phase 5 reload survival).
 *
 * Browser-safe: no node:fs / node:net. Same MistStore contract as MemoryMistStore.
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

const DB_NAME = 'pufam-mist-v1';
const DB_VERSION = 1;
const ENTRIES_STORE = 'entries';
const STATE_STORE = 'state';
const STATE_ROW_ID = 'state';

type StoredEntry = {
  key: string;
  ciphertext: ArrayBuffer;
  meta: MistMeta;
};

type StoredState = {
  id: typeof STATE_ROW_ID;
  contribute: boolean;
};

export type IndexedDbMistStoreOptions = {
  backendId?: string;
  /** Default false — mobile peer policy. */
  contribute?: boolean;
  /** Override IndexedDB factory (tests / fake-indexeddb). */
  indexedDB?: IDBFactory;
};

function toUint8Array(buf: ArrayBuffer): Uint8Array {
  return new Uint8Array(buf);
}

export class IndexedDbMistStore implements MistStore {
  readonly backendId: string;
  private contribute: boolean;
  private readonly idb: IDBFactory;
  private db: IDBDatabase | null = null;
  private readonly watchers = new Map<string, Set<WatchCallback>>();

  constructor(options: IndexedDbMistStoreOptions = {}) {
    this.backendId = options.backendId ?? 'indexeddb';
    this.contribute = options.contribute ?? false;
    this.idb = options.indexedDB ?? globalThis.indexedDB;
  }

  /** Open database and hydrate contribute flag from persisted state. */
  async init(): Promise<void> {
    if (this.db) return;
    this.db = await this.openDb();
    const state = await this.readState();
    if (state) this.contribute = state.contribute;
  }

  /** Factory — prefer this over bare constructor + init. */
  static async open(options: IndexedDbMistStoreOptions = {}): Promise<IndexedDbMistStore> {
    const store = new IndexedDbMistStore(options);
    await store.init();
    return store;
  }

  /** Wipe all entries and reset contribute flag (sign-out / clear local mist data). */
  async clearAll(): Promise<void> {
    await this.init();
    const db = this.db!;
    await this.txPromise(db, [ENTRIES_STORE, STATE_STORE], 'readwrite', (tx) => {
      tx.objectStore(ENTRIES_STORE).clear();
      tx.objectStore(STATE_STORE).delete(STATE_ROW_ID);
    });
    this.contribute = false;
  }

  async put(key: string, ciphertext: Uint8Array, meta: MistPutMeta): Promise<PutResult> {
    await this.init();
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

    const stored: StoredEntry = {
      key,
      ciphertext: ciphertext.buffer.slice(
        ciphertext.byteOffset,
        ciphertext.byteOffset + ciphertext.byteLength,
      ),
      meta: fullMeta,
    };

    const db = this.db!;
    await this.txPromise(db, ENTRIES_STORE, 'readwrite', (tx) => {
      tx.objectStore(ENTRIES_STORE).put(stored);
    });

    const entry: MistEntry = { key, ciphertext, meta: fullMeta };
    this.notifyWatchers(key, entry);

    return { key, contentHash: content_hash, size, ts };
  }

  async get(key: string): Promise<MistEntry | null> {
    await this.init();
    const db = this.db!;
    const stored = await this.txPromise<StoredEntry | undefined>(
      db,
      ENTRIES_STORE,
      'readonly',
      (tx) => tx.objectStore(ENTRIES_STORE).get(key),
    );
    if (!stored) return null;
    return {
      key: stored.key,
      ciphertext: toUint8Array(stored.ciphertext),
      meta: stored.meta,
    };
  }

  /** Remove one entry (workshop wipe / disaster-recovery smoke). */
  async deleteKey(key: string): Promise<boolean> {
    await this.init();
    const db = this.db!;
    const existed = (await this.get(key)) !== null;
    if (!existed) return false;

    await this.txPromise(db, ENTRIES_STORE, 'readwrite', (tx) => {
      tx.objectStore(ENTRIES_STORE).delete(key);
    });
    this.notifyWatchers(key, null);
    return true;
  }

  async list(prefix: string): Promise<MistEntry[]> {
    await this.init();
    const db = this.db!;
    const all = await this.txPromise<StoredEntry[]>(
      db,
      ENTRIES_STORE,
      'readonly',
      (tx) => tx.objectStore(ENTRIES_STORE).getAll(),
    );
    const out: MistEntry[] = [];
    for (const stored of all) {
      if (!keyMatchesPrefix(stored.key, prefix)) continue;
      out.push({
        key: stored.key,
        ciphertext: toUint8Array(stored.ciphertext),
        meta: stored.meta,
      });
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

    void this.get(key).then((entry) => cb(entry));

    return () => {
      set!.delete(cb);
      if (set!.size === 0) this.watchers.delete(key);
    };
  }

  setContribute(enabled: boolean): void {
    this.contribute = enabled;
    void this.persistState();
  }

  getContribute(): boolean {
    return this.contribute;
  }

  async health(): Promise<MistHealth> {
    await this.init();
    return { ok: true, backendId: this.backendId, contribute: this.contribute };
  }

  async stats(): Promise<MistStats> {
    await this.init();
    const db = this.db!;
    const all = await this.txPromise<StoredEntry[]>(
      db,
      ENTRIES_STORE,
      'readonly',
      (tx) => tx.objectStore(ENTRIES_STORE).getAll(),
    );
    let diskUsedBytes = 0;
    for (const stored of all) {
      diskUsedBytes += stored.meta.size;
    }
    return {
      backendId: this.backendId,
      contribute: this.contribute,
      diskUsedBytes,
      entryCount: all.length,
    };
  }

  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!this.idb) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const req = this.idb.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(ENTRIES_STORE)) {
          db.createObjectStore(ENTRIES_STORE, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STATE_STORE)) {
          db.createObjectStore(STATE_STORE, { keyPath: 'id' });
        }
      };
    });
  }

  private async readState(): Promise<StoredState | null> {
    const db = this.db!;
    const row = await this.txPromise<StoredState | undefined>(
      db,
      STATE_STORE,
      'readonly',
      (tx) => tx.objectStore(STATE_STORE).get(STATE_ROW_ID),
    );
    return row ?? null;
  }

  private async persistState(): Promise<void> {
    await this.init();
    const db = this.db!;
    const row: StoredState = { id: STATE_ROW_ID, contribute: this.contribute };
    await this.txPromise(db, STATE_STORE, 'readwrite', (tx) => {
      tx.objectStore(STATE_STORE).put(row);
    });
  }

  private txPromise<T>(
    db: IDBDatabase,
    storeName: string | string[],
    mode: IDBTransactionMode,
    fn: (tx: IDBTransaction) => IDBRequest<T> | void,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const names = Array.isArray(storeName) ? storeName : [storeName];
      const tx = db.transaction(names, mode);
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      const result = fn(tx);
      if (result) {
        result.onsuccess = () => resolve(result.result as T);
        result.onerror = () => reject(result.error ?? new Error('IndexedDB request failed'));
      } else {
        tx.oncomplete = () => resolve(undefined as T);
      }
    });
  }

  private notifyWatchers(key: string, entry: MistEntry): void {
    const set = this.watchers.get(key);
    if (!set) return;
    for (const cb of set) cb(entry);
  }
}
