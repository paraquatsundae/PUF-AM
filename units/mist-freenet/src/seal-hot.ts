/**
 * Hot → Archive seal helper (phase 2).
 *
 * Operates on any MistStore. Hot contract v1 is a **single blob** at
 * `hotKey(farmId, 'current')` — JSON Hot state, not a per-record key space.
 *
 * @see Plans/MIST_NETWORK_STORAGE.md § Hot → Archive seal lifecycle
 */

import { sha256Hex } from './hash.ts';
import { archiveKey, hotKey, manifestKey } from './keys.ts';
import type { MistStore } from './mist-store.ts';

/** One record in the hot window (mist-v1 sketch). */
export type HotRecord = {
  id: string;
  type: string;
  ts: string;
  author: string;
  payload: unknown;
  sig?: string;
};

/** Parsed hot contract state (`hot/current` blob). */
export type HotState = {
  farm_id: string;
  window_start: string;
  records: HotRecord[];
  tombstones: string[];
  last_sealed: string | null;
};

/** Manifest archive pointer entry. */
export type ManifestArchiveEntry = {
  key: string;
  period: string;
  from: string;
  to: string;
  record_count: number;
  content_hash: string;
  created: string;
};

/** Parsed manifest contract state. */
export type ManifestState = {
  farm_id: string;
  version: number;
  hot_contract_key: string;
  archives: ManifestArchiveEntry[];
  schema_version: number;
};

/** Sealed archive contract payload. */
export type ArchiveState = {
  farm_id: string;
  period: string;
  from: string;
  to: string;
  records: HotRecord[];
  content_hash: string;
  sealed_at: string;
  sealed_by: string;
};

export type SealHotPeriodOptions = {
  farmId: string;
  /** Calendar year label, e.g. `"2025"`. */
  period: string;
  sealedBy?: string;
  /** Override clock (ms) for tests. */
  now?: number;
  /** Hot segment — v1 default `current`. */
  hotSegment?: string;
};

export type SealHotPeriodResult = {
  period: string;
  archiveKey: string;
  contentHash: string;
  recordCount: number;
  manifestVersion: number;
  hotRecordsRemaining: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function parseJsonBlob<T>(ciphertext: Uint8Array): T {
  return JSON.parse(decoder.decode(ciphertext)) as T;
}

function toJsonBlob(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value));
}

function periodBounds(period: string): { from: string; to: string } {
  const year = Number.parseInt(period, 10);
  if (!Number.isFinite(year)) {
    throw new Error(`sealHotPeriod: invalid period "${period}"`);
  }
  return {
    from: `${year}-01-01T00:00:00.000Z`,
    to: `${year}-12-31T23:59:59.999Z`,
  };
}

function recordInPeriod(record: HotRecord, period: string): boolean {
  const year = Number.parseInt(period, 10);
  const ts = Date.parse(record.ts);
  if (!Number.isFinite(ts)) return false;
  return new Date(ts).getUTCFullYear() === year;
}

/**
 * Seal hot records for calendar period `P` into an archive contract, update
 * manifest, and trim sealed records from hot/current.
 */
export async function sealHotPeriod(
  store: MistStore,
  options: SealHotPeriodOptions,
): Promise<SealHotPeriodResult> {
  const {
    farmId,
    period,
    sealedBy = 'local-seal',
    now = Date.now(),
    hotSegment = 'current',
  } = options;

  const hotStorageKey = hotKey(farmId, hotSegment);
  const hotEntry = await store.get(hotStorageKey);
  if (!hotEntry) {
    throw new Error(`sealHotPeriod: missing hot blob at ${hotStorageKey}`);
  }

  const hot = parseJsonBlob<HotState>(hotEntry.ciphertext);
  const toSeal = hot.records.filter((r) => recordInPeriod(r, period));
  const remaining = hot.records.filter((r) => !recordInPeriod(r, period));

  const { from, to } = periodBounds(period);
  const sealedAt = new Date(now).toISOString();

  const archivePayload: Omit<ArchiveState, 'content_hash'> = {
    farm_id: farmId,
    period,
    from,
    to,
    records: toSeal,
    sealed_at: sealedAt,
    sealed_by: sealedBy,
  };

  const archiveBytes = toJsonBlob(archivePayload);
  const contentHash = sha256Hex(archiveBytes);
  const archiveStorageKey = archiveKey(farmId, period);

  await store.put(archiveStorageKey, archiveBytes, {
    kind: 'archive',
    period,
    content_hash: contentHash,
    size: archiveBytes.byteLength,
    ts: now,
  });

  const manifestStorageKey = manifestKey(farmId);
  const manifestEntry = await store.get(manifestStorageKey);
  let manifest: ManifestState;

  if (manifestEntry) {
    manifest = parseJsonBlob<ManifestState>(manifestEntry.ciphertext);
  } else {
    manifest = {
      farm_id: farmId,
      version: 0,
      hot_contract_key: hotStorageKey,
      archives: [],
      schema_version: 1,
    };
  }

  const archivePointer: ManifestArchiveEntry = {
    key: archiveStorageKey,
    period,
    from,
    to,
    record_count: toSeal.length,
    content_hash: contentHash,
    created: sealedAt,
  };

  const existingIdx = manifest.archives.findIndex((a) => a.period === period);
  if (existingIdx >= 0) {
    manifest.archives[existingIdx] = archivePointer;
  } else {
    manifest.archives.push(archivePointer);
  }
  manifest.version += 1;
  manifest.hot_contract_key = hotStorageKey;

  const manifestBytes = toJsonBlob(manifest);
  await store.put(manifestStorageKey, manifestBytes, {
    kind: 'manifest',
    version: manifest.version,
    content_hash: sha256Hex(manifestBytes),
    size: manifestBytes.byteLength,
    ts: now,
  });

  const updatedHot: HotState = {
    ...hot,
    records: remaining,
    last_sealed: sealedAt,
  };
  const hotBytes = toJsonBlob(updatedHot);
  await store.put(hotStorageKey, hotBytes, {
    kind: 'hot',
    content_hash: sha256Hex(hotBytes),
    size: hotBytes.byteLength,
    ts: now,
  });

  return {
    period,
    archiveKey: archiveStorageKey,
    contentHash,
    recordCount: toSeal.length,
    manifestVersion: manifest.version,
    hotRecordsRemaining: remaining.length,
  };
}
