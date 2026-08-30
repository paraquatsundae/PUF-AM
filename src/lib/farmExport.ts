/**
 * Human-readable farm-export.json (+ optional xlsx + photo sidecar zip).
 * Local-first from IndexedDB — parallel to Firestore / .pufom sync.
 */
import { zipSync } from 'fflate';
import * as XLSX from 'xlsx';
import type { DiaryEvent } from './farmDiary';
import type { FieldIssue } from './fieldStore';
import { getFarmGeometry } from './farmGeometryIdb';
import { listLocalEntities } from './localFarmRepo';
import { listPhotoOutbox } from './photoOutbox';
import type { OrchardBlock } from './mapStore';

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
export type FarmExportIssue = Omit<FieldIssue, 'photoData'> & { hasPhoto: boolean };

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
  xlsxFilename: string;
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
  const { photoData, ...rest } = issue;
  const hasPhoto = !!(issue.photoUrl || photoData);
  return omitUndefined({ ...rest, hasPhoto }) as FarmExportIssue;
}

export function enrichDiaryForExport(
  event: DiaryEvent,
  blockNames: Map<string, string>
): FarmExportDiaryEvent {
  const row: Record<string, unknown> = { ...event };
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
  const safeName = (farmName || farmId).replace(/[^\w\-]+/g, '_').slice(0, 40);
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
    xlsxFilename: `${basename}_farm-export.xlsx`,
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

  const [geometry, diary, issues, issuesArchive] = await Promise.all([
    getFarmGeometry(farmId),
    listLocalEntities<DiaryEvent>(farmId, 'diary'),
    includeIssues ? listLocalEntities<FieldIssue>(farmId, 'issues') : Promise.resolve([]),
    includeIssuesArchive
      ? listLocalEntities<FieldIssue>(farmId, 'issues_archive')
      : Promise.resolve([]),
  ]);

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

/** Diary sheet columns (xlsx layer). */
export const DIARY_XLSX_COLUMNS = [
  'id',
  'date',
  'type',
  'status',
  'blockId',
  'blockName',
  'title',
  'productName',
  'agentName',
  'sprayType',
  'applicationMethod',
  'carrier',
  'adjuvant',
  'irrigationAmount',
  'durationMinutes',
  'rate',
  'rateUnit',
  'nRate',
  'pRate',
  'kRate',
  'nutritionMethod',
  'assignedTo',
  'assignedToName',
  'priority',
  'safetyChecklistAccepted',
  'acceptedAt',
  'completedAt',
  'linkedIssueId',
  'notes',
  'updatedAt',
  'npkSummary',
] as const;

export const ISSUES_XLSX_COLUMNS = [
  'id',
  'lat',
  'lng',
  'category',
  'priority',
  'status',
  'note',
  'hasPhoto',
  'photoUrl',
  'isMistake',
  'reportedBy',
  'reportedAt',
  'resolvedAt',
  'updatedAt',
] as const;

export const ISSUES_ARCHIVE_XLSX_COLUMNS = [
  ...ISSUES_XLSX_COLUMNS,
  'archivedAt',
  'archivedBy',
] as const;

function npkSummary(event: FarmExportDiaryEvent): string {
  return [
    event.nRate != null ? `N${event.nRate}` : '',
    event.pRate != null ? `P${event.pRate}` : '',
    event.kRate != null ? `K${event.kRate}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function diaryRowForXlsx(event: FarmExportDiaryEvent): Record<string, unknown> {
  return {
    id: event.id,
    date: event.date,
    type: event.type,
    status: diaryStatusForExport(event),
    blockId: event.blockId || '',
    blockName: event.blockName || '',
    title: event.title || '',
    productName: event.productName || '',
    agentName: event.agentName || '',
    sprayType: event.sprayType || '',
    applicationMethod: event.applicationMethod || '',
    carrier: event.carrier || '',
    adjuvant: event.adjuvant || '',
    irrigationAmount: event.irrigationAmount ?? '',
    durationMinutes: event.durationMinutes ?? '',
    rate: event.rate ?? '',
    rateUnit: event.rateUnit || '',
    nRate: event.nRate ?? '',
    pRate: event.pRate ?? '',
    kRate: event.kRate ?? '',
    nutritionMethod: event.nutritionMethod || '',
    assignedTo: event.assignedTo || '',
    assignedToName: event.assignedToName || '',
    priority: event.priority || '',
    safetyChecklistAccepted: event.safetyChecklistAccepted ?? '',
    acceptedAt: event.acceptedAt || '',
    completedAt: event.completedAt || '',
    linkedIssueId: event.linkedIssueId || '',
    notes: event.notes || '',
    updatedAt: event.updatedAt || '',
    npkSummary: npkSummary(event),
  };
}

function issueRowForXlsx(issue: FarmExportIssue, archive: boolean): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: issue.id,
    lat: issue.lat,
    lng: issue.lng,
    category: issue.category,
    priority: issue.priority,
    status: issue.status,
    note: issue.note || '',
    hasPhoto: issue.hasPhoto,
    photoUrl: issue.photoUrl || '',
    isMistake: issue.isMistake ?? '',
    reportedBy: issue.reportedBy,
    reportedAt: issue.reportedAt,
    resolvedAt: issue.resolvedAt || '',
    updatedAt: issue.updatedAt || '',
  };
  if (archive) {
    row.archivedAt = issue.archivedAt || '';
    row.archivedBy = issue.archivedBy || '';
  }
  return row;
}

function sheetFromRows(rows: Record<string, unknown>[]): XLSX.WorkSheet {
  return XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
}

/** Convert a farm-export envelope to an xlsx workbook (Uint8Array). */
export function farmExportToXlsx(bundle: FarmExportV1): Uint8Array {
  const wb = XLSX.utils.book_new();

  const diaryRows = bundle.diary.map(diaryRowForXlsx);
  XLSX.utils.book_append_sheet(wb, sheetFromRows(diaryRows), 'Diary');

  if (bundle.exportScope.issues && bundle.issues.length > 0) {
    const issueRows = bundle.issues.map((i) => issueRowForXlsx(i, false));
    XLSX.utils.book_append_sheet(wb, sheetFromRows(issueRows), 'Issues');
  }

  if (bundle.exportScope.issuesArchive && bundle.issuesArchive.length > 0) {
    const archiveRows = bundle.issuesArchive.map((i) => issueRowForXlsx(i, true));
    XLSX.utils.book_append_sheet(wb, sheetFromRows(archiveRows), 'IssuesArchive');
  }

  const metaRows = [
    { key: 'format', value: bundle.format },
    { key: 'v', value: String(bundle.v) },
    { key: 'exportedAt', value: bundle.exportedAt },
    { key: 'farmId', value: bundle.farmId },
    { key: 'farmName', value: bundle.farmName || '' },
    { key: 'source', value: bundle.source },
    { key: 'exportScope', value: JSON.stringify(bundle.exportScope) },
    { key: 'diaryCount', value: String(bundle.diary.length) },
    { key: 'issuesCount', value: String(bundle.issues.length) },
    { key: 'issuesArchiveCount', value: String(bundle.issuesArchive.length) },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(metaRows), '_Meta');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as Uint8Array;
  return out instanceof Uint8Array ? out : new Uint8Array(out);
}

/** Return xlsx sheet names present in a workbook built from bundle (for tests). */
export function farmExportXlsxSheetNames(bundle: FarmExportV1): string[] {
  const names = ['Diary'];
  if (bundle.exportScope.issues && bundle.issues.length > 0) names.push('Issues');
  if (bundle.exportScope.issuesArchive && bundle.issuesArchive.length > 0) names.push('IssuesArchive');
  names.push('_Meta');
  return names;
}

function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const i = dataUrl.indexOf(',');
  if (i < 0) return null;
  const b64 = dataUrl.slice(i + 1);
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Compress issue photo to records-quality JPEG bytes (1280 px long edge, ~80% quality).
 * Works in browser (canvas) and Node test stubs when canvas unavailable.
 */
export async function compressIssuePhotoForExport(source: Blob | string): Promise<Uint8Array | null> {
  if (typeof source === 'string') {
    const bytes = dataUrlToBytes(source);
    return bytes;
  }

  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') {
    try {
      const buf = await source.arrayBuffer();
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  }

  try {
    const bitmap = await createImageBitmap(source);
    const maxEdge = 1280;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const quality = 0.8;
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    return dataUrlToBytes(dataUrl);
  } catch {
    return null;
  }
}

async function resolveIssuePhotoBytes(
  farmId: string,
  issue: FieldIssue,
  outboxByIssue: Map<string, Blob>
): Promise<Uint8Array | null> {
  const outboxBlob = outboxByIssue.get(issue.id);
  if (outboxBlob) {
    return compressIssuePhotoForExport(outboxBlob);
  }
  if (issue.photoData) {
    return compressIssuePhotoForExport(issue.photoData);
  }
  return null;
}

/** Build sidecar zip entries: photos/{issueId}.jpg for issues with local thumbnails. */
export async function buildFarmExportPhotoEntries(
  farmId: string,
  bundle: FarmExportV1
): Promise<Record<string, Uint8Array>> {
  const outboxRows = await listPhotoOutbox(farmId);
  const outboxByIssue = new Map<string, Blob>();
  for (const row of outboxRows) {
    outboxByIssue.set(row.issueId, row.blob);
  }

  const entries: Record<string, Uint8Array> = {};

  const sourceIssues = await Promise.all([
    listLocalEntities<FieldIssue>(farmId, 'issues'),
    listLocalEntities<FieldIssue>(farmId, 'issues_archive'),
  ]).then(([a, b]) => [...a, ...b]);

  const byId = new Map(sourceIssues.map((i) => [i.id, i]));

  for (const exported of [...bundle.issues, ...bundle.issuesArchive]) {
    if (!exported.hasPhoto) continue;
    const raw = byId.get(exported.id);
    if (!raw) continue;
    const bytes = await resolveIssuePhotoBytes(farmId, raw, outboxByIssue);
    if (bytes && bytes.length > 0) {
      entries[`photos/${exported.id}.jpg`] = bytes;
    }
  }

  return entries;
}

/** Zip farm-export.json + optional photos/ sidecar. */
export async function buildFarmExportZip(
  farmId: string,
  bundle: FarmExportV1,
  opts?: { includePhotos?: boolean }
): Promise<Uint8Array> {
  const jsonName = 'farm-export.json';
  const files: Record<string, Uint8Array> = {
    [jsonName]: new TextEncoder().encode(farmExportJsonString(bundle)),
  };

  if (opts?.includePhotos) {
    const photoEntries = await buildFarmExportPhotoEntries(farmId, bundle);
    Object.assign(files, photoEntries);
  }

  return zipSync(files);
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

export async function downloadFarmExportXlsx(
  farmId: string,
  opts?: BuildFarmExportOpts
): Promise<{ bundle: FarmExportV1; filename: string; bytes: Uint8Array }> {
  const bundle = await buildFarmExportJson(farmId, opts);
  const bytes = farmExportToXlsx(bundle);
  const { xlsxFilename } = farmExportFilenames(opts?.farmName, farmId, bundle.exportedAt);
  downloadBytes(
    bytes,
    xlsxFilename,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  return { bundle, filename: xlsxFilename, bytes };
}

export async function downloadFarmExportZip(
  farmId: string,
  opts?: BuildFarmExportOpts & { includePhotos?: boolean }
): Promise<{ bundle: FarmExportV1; filename: string; bytes: Uint8Array }> {
  const bundle = await buildFarmExportJson(farmId, opts);
  const bytes = await buildFarmExportZip(farmId, bundle, { includePhotos: opts?.includePhotos });
  const { zipFilename } = farmExportFilenames(opts?.farmName, farmId, bundle.exportedAt);
  downloadBytes(bytes, zipFilename, 'application/zip');
  return { bundle, filename: zipFilename, bytes };
}

export function isFarmExportV1(value: unknown): value is FarmExportV1 {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.format === FARM_EXPORT_FORMAT && v.v === FARM_EXPORT_VERSION && typeof v.farmId === 'string';
}
