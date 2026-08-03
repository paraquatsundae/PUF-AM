/**
 * Freenet-backed MistStore — disk cache + FCP transport (phase 3).
 *
 * **Node-only.** Wraps `DiskMistStore` for local latency/offline reads and uses
 * `FreenetTransport` for CHK insert/fetch against a local Hyphanet node.
 *
 * When the node is down:
 * - put/get/list/watch still work against the disk cache
 * - puts queue in a simple outbox for later flush
 * - health reports `freenet: disconnected`
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { assertCiphertextForFreenet } from './ciphertext-guard.ts';
import { DiskMistStore, type DiskMistStoreOptions } from './disk-mist-store.ts';
import type { FreenetOutboxEntry, FreenetKeyIndex, FreenetKeyRecord } from './freenet-keys.ts';
import { freenetIndexPath, outboxPath } from './freenet-keys.ts';
import { normalizeMistFreenetUri } from './freenet-uri-normalize.ts';
import type { FreenetTransport } from './freenet-transport.ts';
import { sha256Hex } from './hash.ts';
import { parseMistKey } from './keys.ts';
import { mockChkUriFromContent } from './mock-freenet-transport.ts';
import type { MistStore } from './mist-store.ts';
import type {
  MistEntry,
  MistHealth,
  MistPutMeta,
  MistStats,
  PutResult,
  Unsubscribe,
  WatchCallback,
} from './types.ts';

export type FreenetMistStoreOptions = DiskMistStoreOptions & {
  backendId?: string;
  transport: FreenetTransport;
  /** Attempt FCP connect on init (default false — connect on first insert). */
  connectOnInit?: boolean;
  /** Vitest only — skip encrypt-before-upload guard. */
  allowPlaintextForTests?: boolean;
};

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, JSON.stringify(value, null, 0), 'utf8');
  await rename(tmp, filePath);
}

export class FreenetMistStore implements MistStore {
  readonly backendId: string;
  private readonly rootDir: string;
  private readonly cache: DiskMistStore;
  private readonly transport: FreenetTransport;
  private readonly connectOnInit: boolean;
  private readonly allowPlaintextForTests: boolean;
  private freenetIndex: FreenetKeyIndex = {};
  private outbox: FreenetOutboxEntry[] = [];
  private ready: Promise<void>;

  constructor(options: FreenetMistStoreOptions) {
    if (!options.transport) throw new Error('FreenetMistStore: transport is required');
    if (!options.rootDir) throw new Error('FreenetMistStore: rootDir is required');

    this.transport = options.transport;
    this.connectOnInit = options.connectOnInit ?? false;
    this.allowPlaintextForTests = options.allowPlaintextForTests ?? false;
    this.backendId = options.backendId ?? 'freenet-mist';
    this.rootDir = path.resolve(options.rootDir);
    this.cache = new DiskMistStore({
      ...options,
      backendId: `${this.backendId}-cache`,
    });
    this.ready = this.load();
  }

  async init(): Promise<void> {
    await this.ready;
  }

  private async load(): Promise<void> {
    await this.cache.init();
    this.freenetIndex = await readJsonFile<FreenetKeyIndex>(freenetIndexPath(this.rootDir), {});
    this.outbox = await readJsonFile<FreenetOutboxEntry[]>(outboxPath(this.rootDir), []);

    if (this.connectOnInit) {
      try {
        await this.transport.connect();
        await this.flushOutbox();
      } catch {
        // Graceful — cache still works offline
      }
    }
  }

  private async persistIndex(): Promise<void> {
    await writeJsonAtomic(freenetIndexPath(this.rootDir), this.freenetIndex);
  }

  private async persistOutbox(): Promise<void> {
    await writeJsonAtomic(outboxPath(this.rootDir), this.outbox);
  }

  async put(key: string, ciphertext: Uint8Array, meta: MistPutMeta): Promise<PutResult> {
    await this.ready;
    assertCiphertextForFreenet(key, ciphertext, {
      allowPlaintext: this.allowPlaintextForTests,
    });
    const result = await this.cache.put(key, ciphertext, meta);

    this.freenetIndex[key] = {
      uri: mockChkUriFromContent(ciphertext),
      content_hash: result.contentHash,
      pending: true,
    };
    await this.persistIndex();
    await this.tryInsert(key, ciphertext, result.contentHash);
    return result;
  }

  private async tryInsert(key: string, ciphertext: Uint8Array, contentHash: string): Promise<void> {
    if (!this.transport.isConnected()) {
      try {
        await this.transport.connect();
      } catch {
        this.enqueueOutbox(key, contentHash);
        return;
      }
    }

    try {
      const { uri } = await this.transport.putBlob(ciphertext, {
        identifier: `mist-${Date.now()}`,
        contribute: this.getContribute(),
      });
      this.freenetIndex[key] = {
        uri,
        content_hash: contentHash,
        insertedAt: Date.now(),
        pending: false,
      };
      await this.persistIndex();
      this.outbox = this.outbox.filter((e) => e.key !== key);
      await this.persistOutbox();
    } catch {
      this.enqueueOutbox(key, contentHash);
    }
  }

  private enqueueOutbox(key: string, contentHash: string): void {
    if (!this.outbox.some((e) => e.key === key)) {
      this.outbox.push({ key, content_hash: contentHash, queuedAt: Date.now() });
    }
    void this.persistOutbox();
  }

  /** Flush queued inserts when a node becomes available. */
  async flushOutbox(): Promise<number> {
    await this.ready;
    let flushed = 0;

    for (const entry of [...this.outbox]) {
      const cached = await this.cache.get(entry.key);
      if (!cached) continue;
      await this.tryInsert(entry.key, cached.ciphertext, entry.content_hash);
      if (!this.freenetIndex[entry.key]?.pending) flushed++;
    }
    return flushed;
  }

  async get(key: string): Promise<MistEntry | null> {
    await this.ready;
    const cached = await this.cache.get(key);
    if (cached) return cached;

    const record = this.freenetIndex[key];
    if (!record?.uri) return null;

    if (!this.transport.isConnected()) {
      try {
        await this.transport.connect();
      } catch {
        return null;
      }
    }

    try {
      const remote = await this.transport.getBlob(record.uri);
      if (!remote) return null;
      const parsed = parseMistKey(key);
      const kind = parsed?.kind ?? 'bones';
      await this.cache.put(key, remote, { kind, content_hash: record.content_hash });
      return this.cache.get(key);
    } catch {
      return null;
    }
  }

  async list(prefix: string): Promise<MistEntry[]> {
    await this.ready;
    return this.cache.list(prefix);
  }

  watch(key: string, cb: WatchCallback): Unsubscribe {
    return this.cache.watch(key, cb);
  }

  setContribute(enabled: boolean): void {
    this.cache.setContribute(enabled);
  }

  getContribute(): boolean {
    return this.cache.getContribute();
  }

  async health(): Promise<MistHealth> {
    await this.ready;
    const transportHealth = await this.transport.health();
    const freenet =
      transportHealth.status === 'connected'
        ? ('connected' as const)
        : transportHealth.status === 'connecting'
          ? ('connecting' as const)
          : ('disconnected' as const);

    return {
      ok: true,
      backendId: this.backendId,
      contribute: this.getContribute(),
      freenet,
    };
  }

  async stats(): Promise<MistStats> {
    await this.ready;
    const base = await this.cache.stats();
    return {
      ...base,
      backendId: this.backendId,
      freenetPendingInserts: this.outbox.length,
      freenetIndexedKeys: Object.keys(this.freenetIndex).length,
    };
  }

  /** Underlying disk cache (tests / advanced use). */
  getCache(): DiskMistStore {
    return this.cache;
  }

  /** Freenet URI for a mist key when indexed. */
  getFreenetRecord(key: string): FreenetKeyRecord | undefined {
    return this.freenetIndex[key];
  }

  /**
   * Fetch ciphertext by URI when local index is empty (two-laptop workshop).
   * Updates disk cache + freenet-index on success.
   */
  async pullByUri(key: string, uri: string, contentHash?: string): Promise<MistEntry | null> {
    await this.ready;
    const normalizedUri = normalizeMistFreenetUri(uri);

    const cached = await this.cache.get(key);
    if (cached && (!contentHash || cached.meta.content_hash === contentHash)) {
      return cached;
    }

    if (!this.transport.isConnected()) {
      try {
        await this.transport.connect();
      } catch {
        return null;
      }
    }

    try {
      const remote = await this.transport.getBlob(normalizedUri);
      if (!remote) return null;

      const parsed = parseMistKey(key);
      const kind = parsed?.kind ?? 'bones';
      const hash = contentHash ?? sha256Hex(remote);
      await this.cache.put(key, remote, { kind, content_hash: hash });
      this.freenetIndex[key] = {
        uri: normalizedUri,
        content_hash: hash,
        insertedAt: Date.now(),
        pending: false,
      };
      await this.persistIndex();
      return this.cache.get(key);
    } catch {
      return null;
    }
  }

  /** Test helper — remove all persisted state. */
  async destroy(): Promise<void> {
    await this.cache.destroy();
    this.freenetIndex = {};
    this.outbox = [];
    this.ready = Promise.resolve();
  }
}
