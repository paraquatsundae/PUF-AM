/**
 * Disk-backed MistStore — phase 2 local “fake Freenet”.
 *
 * **Node-only** (`node:fs`). Import from `./node.ts`, not the browser-safe
 * `./index.ts`, so Vite client bundles never pull filesystem APIs.
 *
 * `contribute_storage = false` (default): own put/get/list/watch still work;
 * persisted flag is reflected in health/stats. Foreign replication is deferred
 * to phase 4 — a future `replicate()` should refuse inbound copies when false.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import { MistStorageFullError } from './errors.ts';
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

const DEFAULT_MAX_BYTES = 512 * 1024 * 1024; // 512 MiB — mobile policy lower bound

type DiskIndex = Record<string, MistMeta>;

type DiskState = {
  contribute: boolean;
  maxBytes: number;
};

export type DiskMistStoreOptions = {
  /** Root directory for all persisted blobs and index files. */
  rootDir: string;
  backendId?: string;
  /** Default false — mobile peer policy. */
  contribute?: boolean;
  /** Disk budget cap; default 512 MiB. */
  maxBytes?: number;
};

function keyToRelativePath(key: string): string {
  return key.split('/').join(path.sep);
}

function blobPath(rootDir: string, key: string): string {
  return path.join(rootDir, 'blobs', keyToRelativePath(key), 'data.bin');
}

function metaPath(rootDir: string, key: string): string {
  return path.join(rootDir, 'blobs', keyToRelativePath(key), 'meta.json');
}

function statePath(rootDir: string): string {
  return path.join(rootDir, '_mist', 'state.json');
}

function indexPath(rootDir: string): string {
  return path.join(rootDir, '_mist', 'index.json');
}

async function ensureDir(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

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
  await ensureDir(filePath);
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, JSON.stringify(value, null, 0), 'utf8');
  await rename(tmp, filePath);
}

export class DiskMistStore implements MistStore {
  readonly backendId: string;
  private readonly rootDir: string;
  private contribute: boolean;
  private maxBytes: number;
  private index: DiskIndex = {};
  private readonly watchers = new Map<string, Set<WatchCallback>>();
  private ready: Promise<void>;

  constructor(options: DiskMistStoreOptions) {
    if (!options.rootDir) {
      throw new Error('DiskMistStore: rootDir is required');
    }
    this.rootDir = path.resolve(options.rootDir);
    this.backendId = options.backendId ?? 'local-fake-freenet';
    this.contribute = options.contribute ?? false;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.ready = this.load();
  }

  /** Await internal index/state load (constructor kicks this off). */
  async init(): Promise<void> {
    await this.ready;
  }

  private async load(): Promise<void> {
    await mkdir(path.join(this.rootDir, '_mist'), { recursive: true });
    await mkdir(path.join(this.rootDir, 'blobs'), { recursive: true });

    const state = await readJsonFile<DiskState>(statePath(this.rootDir), {
      contribute: this.contribute,
      maxBytes: this.maxBytes,
    });
    this.contribute = state.contribute;
    this.maxBytes = state.maxBytes;

    this.index = await readJsonFile<DiskIndex>(indexPath(this.rootDir), {});
  }

  private persistStateSync(): void {
    const file = statePath(this.rootDir);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(
      file,
      JSON.stringify({
        contribute: this.contribute,
        maxBytes: this.maxBytes,
      } satisfies DiskState),
      'utf8',
    );
  }

  private async persistIndex(): Promise<void> {
    await writeJsonAtomic(indexPath(this.rootDir), this.index);
  }

  private usedBytes(): number {
    let total = 0;
    for (const meta of Object.values(this.index)) {
      total += meta.size;
    }
    return total;
  }

  async put(key: string, ciphertext: Uint8Array, meta: MistPutMeta): Promise<PutResult> {
    await this.ready;

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

    const previousSize = this.index[key]?.size ?? 0;
    const nextUsed = this.usedBytes() - previousSize + size;
    if (nextUsed > this.maxBytes) {
      throw new MistStorageFullError(this.maxBytes, this.usedBytes() - previousSize, size);
    }

    const blob = blobPath(this.rootDir, key);
    const metaFile = metaPath(this.rootDir, key);
    await ensureDir(blob);

    const blobTmp = `${blob}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(blobTmp, ciphertext);
    await rename(blobTmp, blob);
    await writeJsonAtomic(metaFile, fullMeta);

    this.index[key] = fullMeta;
    await this.persistIndex();

    const entry: MistEntry = { key, ciphertext, meta: fullMeta };
    this.notifyWatchers(key, entry);

    return { key, contentHash: content_hash, size, ts };
  }

  async get(key: string): Promise<MistEntry | null> {
    await this.ready;

    const meta = this.index[key];
    if (!meta) return null;

    const blob = blobPath(this.rootDir, key);
    try {
      const buf = await readFile(blob);
      const ciphertext = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      return { key, ciphertext, meta };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return null;
      throw err;
    }
  }

  async list(prefix: string): Promise<MistEntry[]> {
    await this.ready;

    const keys = Object.keys(this.index)
      .filter((k) => keyMatchesPrefix(k, prefix))
      .sort((a, b) => a.localeCompare(b));

    const out: MistEntry[] = [];
    for (const key of keys) {
      const entry = await this.get(key);
      if (entry) out.push(entry);
    }
    return out;
  }

  watch(key: string, cb: WatchCallback): Unsubscribe {
    let set = this.watchers.get(key);
    if (!set) {
      set = new Set();
      this.watchers.set(key, set);
    }
    set.add(cb);

    void this.ready.then(async () => {
      const entry = await this.get(key);
      cb(entry);
    });

    return () => {
      set!.delete(cb);
      if (set!.size === 0) this.watchers.delete(key);
    };
  }

  setContribute(enabled: boolean): void {
    this.contribute = enabled;
    this.persistStateSync();
  }

  getContribute(): boolean {
    return this.contribute;
  }

  /** Update disk budget cap (persisted in state.json). */
  setMaxBytes(maxBytes: number): void {
    this.maxBytes = maxBytes;
    this.persistStateSync();
  }

  getMaxBytes(): number {
    return this.maxBytes;
  }

  async health(): Promise<MistHealth> {
    await this.ready;
    return { ok: true, backendId: this.backendId, contribute: this.contribute };
  }

  async stats(): Promise<MistStats> {
    await this.ready;
    return {
      backendId: this.backendId,
      contribute: this.contribute,
      diskUsedBytes: this.usedBytes(),
      entryCount: Object.keys(this.index).length,
    };
  }

  /** Remove all persisted data under rootDir (for tests). */
  async destroy(): Promise<void> {
    await this.ready;
    await rm(this.rootDir, { recursive: true, force: true });
    this.index = {};
    this.watchers.clear();
    this.ready = Promise.resolve();
  }

  private notifyWatchers(key: string, entry: MistEntry): void {
    const set = this.watchers.get(key);
    if (!set) return;
    for (const cb of set) cb(entry);
  }
}
