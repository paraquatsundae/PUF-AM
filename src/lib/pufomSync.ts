/**
 * Build / apply .pufom bundles against local IndexedDB stores.
 */
import {
  mergePufomBundles,
  PUFOM_FORMAT,
  PUFOM_VERSION,
  type PufomBundleV1,
  type PufomEntity,
} from '../../shared/sync/pufomBundle';
import type { DiaryEvent } from './farmDiary';
import type { FieldIssue } from './fieldStore';
import {
  getFarmGeometry,
  listPending,
  saveFarmGeometry,
  type FarmGeometryBundle,
} from './farmGeometryIdb';
import {
  listLocalEntities,
  listOutbox,
  pendingOutboxCount,
  replaceLocalEntities,
} from './localFarmRepo';
import { decodePufomBlob, encodePufomBundle } from './pufomCodec';
import { auth } from '../firebase';
import { syncApiUrl } from './mdnsPeers';

export type SyncPendingCounts = {
  outbox: number;
  geometry: number;
  total: number;
};

export async function getSyncPendingCounts(farmId: string): Promise<SyncPendingCounts> {
  const [outbox, geometry] = await Promise.all([
    pendingOutboxCount(farmId),
    listPending(farmId).then((p) => p.length),
  ]);
  return { outbox, geometry, total: outbox + geometry };
}

export async function buildPufomBundle(
  farmId: string,
  opts?: { farmName?: string; deviceLabel?: string }
): Promise<PufomBundleV1> {
  const [geometry, issues, issuesArchive, diary] = await Promise.all([
    getFarmGeometry(farmId),
    listLocalEntities<FieldIssue>(farmId, 'issues'),
    listLocalEntities<FieldIssue>(farmId, 'issues_archive'),
    listLocalEntities<DiaryEvent>(farmId, 'diary'),
  ]);

  return {
    format: PUFOM_FORMAT,
    version: PUFOM_VERSION,
    farmId,
    farmName: opts?.farmName,
    exportedAt: new Date().toISOString(),
    deviceLabel: opts?.deviceLabel || (typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 80) : undefined),
    geometry: {
      blocks: geometry.blocks as unknown as PufomEntity[],
      pins: geometry.pins as unknown as PufomEntity[],
      tracks: geometry.tracks as unknown as PufomEntity[],
      viewport: (geometry.viewport as unknown as Record<string, unknown>) || null,
      updatedAt: geometry.updatedAt,
    },
    issues: issues as unknown as PufomEntity[],
    issuesArchive: issuesArchive as unknown as PufomEntity[],
    diary: diary as unknown as PufomEntity[],
  };
}

export type ApplyPufomResult = {
  farmId: string;
  blocks: number;
  pins: number;
  tracks: number;
  issues: number;
  issuesArchive: number;
  diary: number;
};

/** Merge incoming bundle into local stores (LWW). Does not auto-queue cloud outbox. */
export async function applyPufomBundle(
  incoming: PufomBundleV1,
  expectedFarmId?: string
): Promise<ApplyPufomResult> {
  if (expectedFarmId && incoming.farmId !== expectedFarmId) {
    throw new Error(
      `This .pufom is for farm ${incoming.farmId}, but you are on ${expectedFarmId}.`
    );
  }

  const farmId = incoming.farmId;
  const localBundle = await buildPufomBundle(farmId);
  const merged = mergePufomBundles(localBundle, incoming);

  const geometry: FarmGeometryBundle = {
    farmId,
    blocks: merged.geometry.blocks as unknown as FarmGeometryBundle['blocks'],
    pins: merged.geometry.pins as unknown as FarmGeometryBundle['pins'],
    tracks: merged.geometry.tracks as unknown as FarmGeometryBundle['tracks'],
    viewport: merged.geometry.viewport as unknown as FarmGeometryBundle['viewport'],
    updatedAt: merged.geometry.updatedAt,
  };
  await saveFarmGeometry(geometry);

  const issues = merged.issues as unknown as FieldIssue[];
  const issuesArchive = merged.issuesArchive as unknown as FieldIssue[];
  const diary = merged.diary as unknown as DiaryEvent[];

  await replaceLocalEntities(farmId, 'issues', issues);
  await replaceLocalEntities(farmId, 'issues_archive', issuesArchive);
  await replaceLocalEntities(farmId, 'diary', diary);

  return {
    farmId,
    blocks: geometry.blocks.length,
    pins: geometry.pins.length,
    tracks: geometry.tracks.length,
    issues: issues.length,
    issuesArchive: issuesArchive.length,
    diary: diary.length,
  };
}

export async function exportPufomFile(
  farmId: string,
  opts?: { farmName?: string }
): Promise<{ bytes: Uint8Array; filename: string; bundle: PufomBundleV1 }> {
  const bundle = await buildPufomBundle(farmId, opts);
  const bytes = await encodePufomBundle(bundle);
  const day = bundle.exportedAt.slice(0, 10);
  const safeName = (opts?.farmName || farmId).replace(/[^\w\-]+/g, '_').slice(0, 40);
  return {
    bytes,
    filename: `${safeName}_${day}.pufom`,
    bundle,
  };
}

export async function importPufomFile(
  file: Blob,
  expectedFarmId?: string
): Promise<ApplyPufomResult> {
  const bundle = await decodePufomBlob(file);
  return applyPufomBundle(bundle, expectedFarmId);
}

export function downloadBytes(bytes: Uint8Array, filename: string): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function authHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to use LAN sync.');
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/octet-stream',
  };
}

/** Push current local farm state to the selected LAN hub shelf. */
export async function pushLanBundle(farmId: string, farmName?: string): Promise<{ bytes: number }> {
  const { bytes } = await exportPufomFile(farmId, { farmName });
  const res = await fetch(syncApiUrl(`/api/sync/lan/${encodeURIComponent(farmId)}`), {
    method: 'POST',
    headers: await authHeaders(),
    body: bytes,
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(String(data.error || `LAN push failed (${res.status})`));
  return { bytes: Number(data.bytes) || bytes.length };
}

/** Pull latest LAN shelf bundle and merge locally. */
export async function pullLanBundle(farmId: string): Promise<ApplyPufomResult | null> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to use LAN sync.');
  const token = await user.getIdToken();
  const res = await fetch(syncApiUrl(`/api/sync/lan/${encodeURIComponent(farmId)}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(String((data as { error?: string }).error || `LAN pull failed (${res.status})`));
  }
  const buf = await res.arrayBuffer();
  const { decodePufomBytes } = await import('./pufomCodec');
  const bundle = await decodePufomBytes(new Uint8Array(buf));
  return applyPufomBundle(bundle, farmId);
}

export async function lanBundleMeta(
  farmId: string
): Promise<{ farmId: string; updatedAt: string; bytes: number; exportedAt?: string } | null> {
  const user = auth.currentUser;
  if (!user) return null;
  const token = await user.getIdToken();
  const res = await fetch(syncApiUrl(`/api/sync/lan/${encodeURIComponent(farmId)}/meta`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return (await res.json()) as {
    farmId: string;
    updatedAt: string;
    bytes: number;
    exportedAt?: string;
  };
}

/** Debug helper — pending cloud ops still waiting. */
export async function listAllPendingOps(farmId: string) {
  const [outbox, geometry] = await Promise.all([listOutbox(farmId), listPending(farmId)]);
  return { outbox, geometry };
}
