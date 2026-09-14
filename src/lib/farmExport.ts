/**
 * Human-readable farm-export.json (+ photo sidecar zip).
 * Local-first from IndexedDB — parallel to Firestore / .pufom sync.
 *
 * The spreadsheet face of the same envelope lives in `farmExportSheets.ts`,
 * which imports from here. Keep the dependency one way.
 */
import { zipSync } from 'fflate';
import type { DiaryEvent } from './farmDiary';
import type { FieldIssue } from './fieldStore';
import { issueHasPhoto } from './issuePhotoMeta';
import { listEventPhotoRefs, photosForFirestore } from './farmPhoto';
import { getFarmGeometry } from './farmGeometryIdb';
import { listLocalEntities } from './localFarmRepo';
import { localFieldIssues } from './localFieldIssues';
import { unionIssuesByUpdatedAt } from './issuePhotoMeta';
import type { OrchardBlock } from './mapStore';
import {
  buildFarmExportPhotoEntries,
  farmExportPhotoMissingWarning,
  type FarmExportMissingPhoto,
} from './farmExportPhotos';

export { buildFarmExportPhotoEntries, farmExportPhotoMissingWarning };
export type { FarmExportMissingPhoto };

export const FARM_EXPORT_FORMAT = 'farm-export' as const;
export const FARM_EXPORT_VERSION = 1 as const;

export type FarmExportSource = 'firebase' | 'local' | 'mist';

export type FarmExportScope = {
  diary: 'all';
  issues: boolean;
  issuesArchive: boolean;
};

export type FarmExportDiaryEvent = DiaryEvent & { blockName?: string };

/** Issue row for export — photoData stripped; hasPhoto derived. */
export type FarmExportIssue = Omit<FieldIssue, 'photoData' | 'photoStatus' | 'photoError'> & {
  hasPhoto: boolean;
};

export type FarmExportV1 = {
  format: typeof FARM_EXPORT_FORMAT;
  v: typeof FARM_EXPORT_VERSION;
  exportedAt: string;
  farmId: string;
  farmName?: string;
  source: FarmExportSource;
  exportScope: FarmExportScope;
  diary: FarmExportDiaryEvent[];
  issues: FarmExportIssue[];
  issuesArchive: FarmExportIssue[];
};

export type BuildFarmExportOpts = {
  farmName?: string;
  source?: FarmExportSource;
  includeIssues?: boolean;
  includeIssuesArchive?: boolean;
};

export type FarmExportDownloadFiles = {
  jsonFilename: string;
  /** Zip of one CSV per sheet. */
  sheetsFilename: string;
  /** The diary sheet on its own, for the diary page's single-sheet export. */
  diaryCsvFilename: string;
  zipFilename: string;
  basename: string;
};

const DIARY_TYPE_ORDER: Record<DiaryEvent['type'], number> = {
  spray: 0,
  irrigation: 1,
  work: 2,
  nutrition: 3,
};

/** Strip undefined keys (Firestore hygiene). */
export function omitUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj };
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

export function buildBlockNameMap(blocks: Pick<OrchardBlock, 'id' | 'name'>[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const block of blocks) {
    map.set(block.id, block.name);
  }
  return map;
}

export function resolveBlockName(blockId: string | undefined, blockNames: Map<string, string>): string | undefined {
  if (!blockId) return undefined;
  return blockNames.get(blockId);
}

export function sanitizeIssueForExport(issue: FieldIssue): FarmExportIssue {
  const { photoData, photoStatus, photoError, ...rest } = issue;
  const hasPhoto = issueHasPhoto(issue);
  const photos = photosForFirestore(issue.photos);
  return omitUndefined({ ...rest, ...(photos ? { photos } : {}), hasPhoto }) as FarmExportIssue;
}

export function enrichDiaryForExport(
  event: DiaryEvent,
  blockNames: Map<string, string>
): FarmExportDiaryEvent {
  const row: Record<string, unknown> = { ...event };
  const photos = photosForFirestore(listEventPhotoRefs(event));
  if (photos) row.photos = photos;
  if (event.blockId) {
    const blockName = resolveBlockName(event.blockId, blockNames);
    if (blockName) row.blockName = blockName;
  }
  return omitUndefined(row) as unknown as FarmExportDiaryEvent;
}

export function sortDiaryForExport(events: FarmExportDiaryEvent[]): FarmExportDiaryEvent[] {
  return [...events].sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    const typeCmp = DIARY_TYPE_ORDER[a.type] - DIARY_TYPE_ORDER[b.type];
    if (typeCmp !== 0) return typeCmp;
    return a.id.localeCompare(b.id);
  });
}

export function diaryStatusForExport(event: DiaryEvent): string {
  return event.status || (event.type === 'work' ? 'planned' : 'done');
}

export function farmExportBasename(farmName: string | undefined, farmId: string, exportedAt: string): string {
  const day = exportedAt.slice(0, 10);
  const safeName = (farmName || farmId).replace(/[^\w-]+/g, '_').slice(0, 40);
  return `${safeName}_${day}`;
}

export function farmExportFilenames(
  farmName: string | undefined,
  farmId: string,
  exportedAt: string
): FarmExportDownloadFiles {
  const basename = farmExportBasename(farmName, farmId, exportedAt);
  return {
    basename,
    jsonFilename: `${basename}_farm-export.json`,
    sheetsFilename: `${basename}_farm-export-sheets.zip`,
    diaryCsvFilename: `${basename}_diary.csv`,
    zipFilename: `${basename}_farm-export.zip`,
  };
}

export function assembleFarmExportEnvelope(input: {
  farmId: string;
  farmName?: string;
  source?: FarmExportSource;
  includeIssues?: boolean;
  includeIssuesArchive?: boolean;
  diary: DiaryEvent[];
  issues: FieldIssue[];
  issuesArchive: FieldIssue[];
  blockNames: Map<string, string>;
  exportedAt?: string;
}): FarmExportV1 {
  const includeIssues = input.includeIssues !== false;
  const includeIssuesArchive = input.includeIssuesArchive !== false;
  const exportedAt = input.exportedAt || new Date().toISOString();

  const diary = sortDiaryForExport(
    input.diary.map((e) => enrichDiaryForExport(e, input.blockNames))
  );

  return {
    format: FARM_EXPORT_FORMAT,
    v: FARM_EXPORT_VERSION,
    exportedAt,
    farmId: input.farmId,
    farmName: input.farmName,
    source: input.source || 'local',
    exportScope: {
      diary: 'all',
      issues: includeIssues,
      issuesArchive: includeIssuesArchive,
    },
    diary,
    issues: includeIssues ? input.issues.map(sanitizeIssueForExport) : [],
    issuesArchive: includeIssuesArchive ? input.issuesArchive.map(sanitizeIssueForExport) : [],
  };
}

/** Read local IndexedDB entities and build the farm-export envelope. */
export async function buildFarmExportJson(
  farmId: string,
  opts?: BuildFarmExportOpts
): Promise<FarmExportV1> {
  const includeIssues = opts?.includeIssues !== false;
  const includeIssuesArchive = opts?.includeIssuesArchive !== false;

  const [geometry, diary, repoIssues, repoArchive] = await Promise.all([
    getFarmGeometry(farmId),
    listLocalEntities<DiaryEvent>(farmId, 'diary'),
    includeIssues ? listLocalEntities<FieldIssue>(farmId, 'issues') : Promise.resolve([]),
    includeIssuesArchive
      ? listLocalEntities<FieldIssue>(farmId, 'issues_archive')
      : Promise.resolve([]),
  ]);
  const issues = includeIssues
    ? unionIssuesByUpdatedAt(repoIssues, localFieldIssues.getOpen(farmId))
    : [];
  const issuesArchive = includeIssuesArchive
    ? unionIssuesByUpdatedAt(repoArchive, localFieldIssues.getArchived(farmId))
    : [];

  const blockNames = buildBlockNameMap(geometry.blocks);

  return assembleFarmExportEnvelope({
    farmId,
    farmName: opts?.farmName,
    source: opts?.source || 'local',
    includeIssues,
    includeIssuesArchive,
    diary,
    issues,
    issuesArchive,
    blockNames,
  });
}

export function farmExportJsonString(bundle: FarmExportV1): string {
  return JSON.stringify(bundle, null, 2);
}

/** Zip farm-export.json + optional photos/ sidecar. */
export async function buildFarmExportZip(
  farmId: string,
  bundle: FarmExportV1,
  opts?: { includePhotos?: boolean }
): Promise<{ bytes: Uint8Array; missingPhotos: FarmExportMissingPhoto[] }> {
  const jsonName = 'farm-export.json';
  const files: Record<string, Uint8Array> = {
    [jsonName]: new TextEncoder().encode(farmExportJsonString(bundle)),
  };
  let missingPhotos: FarmExportMissingPhoto[] = [];

  if (opts?.includePhotos) {
    const photoBuild = await buildFarmExportPhotoEntries(farmId, bundle);
    Object.assign(files, photoBuild.entries);
    missingPhotos = photoBuild.missing;
  }

  return { bytes: zipSync(files), missingPhotos };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadBytes(bytes: Uint8Array, filename: string, mime = 'application/octet-stream'): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  downloadBlob(new Blob([copy], { type: mime }), filename);
}

export async function downloadFarmExportJson(
  farmId: string,
  opts?: BuildFarmExportOpts
): Promise<{ bundle: FarmExportV1; filename: string }> {
  const bundle = await buildFarmExportJson(farmId, opts);
  const { jsonFilename } = farmExportFilenames(opts?.farmName, farmId, bundle.exportedAt);
  const json = farmExportJsonString(bundle);
  downloadBlob(new Blob([json], { type: 'application/json;charset=utf-8' }), jsonFilename);
  return { bundle, filename: jsonFilename };
}

export async function downloadFarmExportZip(
  farmId: string,
  opts?: BuildFarmExportOpts & { includePhotos?: boolean }
): Promise<{
  bundle: FarmExportV1;
  filename: string;
  bytes: Uint8Array;
  missingPhotos: FarmExportMissingPhoto[];
}> {
  const bundle = await buildFarmExportJson(farmId, opts);
  const { bytes, missingPhotos } = await buildFarmExportZip(farmId, bundle, {
    includePhotos: opts?.includePhotos,
  });
  const { zipFilename } = farmExportFilenames(opts?.farmName, farmId, bundle.exportedAt);
  downloadBytes(bytes, zipFilename, 'application/zip');
  return { bundle, filename: zipFilename, bytes, missingPhotos };
}

export function isFarmExportV1(value: unknown): value is FarmExportV1 {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.format === FARM_EXPORT_FORMAT && v.v === FARM_EXPORT_VERSION && typeof v.farmId === 'string';
}
