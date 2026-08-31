/**
 * The spreadsheet face of a farm export: one CSV per logical sheet, zipped.
 *
 * Sheets are a zip of CSVs rather than a workbook. The xlsx package this used
 * to build carries an unpatched prototype-pollution and ReDoS advisory with no
 * upstream fix, and nothing here ever read a workbook back — the export is
 * write-only, so the format was free to change.
 *
 * Depends on `farmExport.ts` one way only. The envelope does not know about
 * sheets, which is what keeps the JSON export free of this file's weight.
 */
import { zipSync } from 'fflate';
import {
  buildFarmExportJson,
  diaryStatusForExport,
  downloadBlob,
  downloadBytes,
  farmExportFilenames,
  type BuildFarmExportOpts,
  type FarmExportDiaryEvent,
  type FarmExportIssue,
  type FarmExportV1,
} from './farmExport';

export const DIARY_SHEET_COLUMNS = [
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

export const ISSUES_SHEET_COLUMNS = [
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

export const ISSUES_ARCHIVE_SHEET_COLUMNS = [
  ...ISSUES_SHEET_COLUMNS,
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

function diaryRowForSheet(event: FarmExportDiaryEvent): Record<string, unknown> {
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

function issueRowForSheet(issue: FarmExportIssue, archive: boolean): Record<string, unknown> {
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

/**
 * Excel and Sheets treat a cell opening with any of these as a formula, not
 * text. Diary notes and issue notes are free text typed by whoever was in the
 * paddock, and a spray diary is exactly the file that gets emailed to an
 * agronomist or an auditor and opened without a second thought.
 *
 * The workbook this export replaced was not exposed to it — `xlsx` wrote string
 * cells as strings — so neutralising it here is keeping a property we had, not
 * adding a new one.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * RFC 4180 field, with formula leads defused.
 *
 * A quote inside a field is escaped by doubling it, and only fields containing
 * a delimiter, quote or newline get wrapped — quoting everything
 * unconditionally is what corrupts a cell whose note happens to contain a quote
 * character.
 *
 * The formula guard applies to strings only, so a negative `lat` of -33.9 stays
 * a number rather than becoming text with a leading apostrophe.
 */
function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  const defused = typeof value === 'string' && FORMULA_LEAD.test(text) ? `'${text}` : text;
  if (!/[",\r\n]/.test(defused)) return defused;
  return `"${defused.replace(/"/g, '""')}"`;
}

/**
 * Rows to CSV, with the header taken from the union of the rows' keys.
 *
 * `fallbackColumns` is what an empty sheet gets. A zero-byte file is
 * indistinguishable from a broken export, and the one thing somebody opening
 * this needs to be able to tell is "no rows" from "this did not work" — so an
 * empty diary still ships its header.
 */
function csvFromRows(
  rows: Record<string, unknown>[],
  fallbackColumns: readonly string[] = []
): string {
  const columns = rows.length
    ? [...new Set(rows.flatMap((row) => Object.keys(row)))]
    : [...fallbackColumns];
  if (columns.length === 0) return '';
  const lines = [
    columns.map(csvField).join(','),
    ...rows.map((row) => columns.map((col) => csvField(row[col])).join(',')),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

/** Logical sheet name to its CSV filename inside the zip. */
const SHEET_FILENAMES: Record<string, string> = {
  Diary: 'diary.csv',
  Issues: 'issues.csv',
  IssuesArchive: 'issues-archive.csv',
  _Meta: 'meta.csv',
};

/** Convert a farm-export envelope to one CSV per sheet, keyed by sheet name. */
export function farmExportToCsvSheets(bundle: FarmExportV1): Record<string, string> {
  const sheets: Record<string, string> = {
    Diary: csvFromRows(bundle.diary.map(diaryRowForSheet), DIARY_SHEET_COLUMNS),
  };

  if (bundle.exportScope.issues && bundle.issues.length > 0) {
    sheets.Issues = csvFromRows(bundle.issues.map((i) => issueRowForSheet(i, false)));
  }

  if (bundle.exportScope.issuesArchive && bundle.issuesArchive.length > 0) {
    sheets.IssuesArchive = csvFromRows(bundle.issuesArchive.map((i) => issueRowForSheet(i, true)));
  }

  sheets._Meta = csvFromRows([
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
  ]);

  return sheets;
}

/**
 * A UTF-8 BOM, because Excel on Windows decodes a double-clicked `.csv` with
 * the system ANSI codepage otherwise. This is a Windows-first project and the
 * notes are full of `°C`, `µg/L` and en dashes; without this they arrive as
 * mojibake. Added at the zip boundary so `farmExportToCsvSheets` stays clean
 * for anything reading the CSV programmatically.
 */
const UTF8_BOM = '\uFEFF';

/** Zip the CSV sheets into one download. */
export function farmExportToSheetsZip(bundle: FarmExportV1): Uint8Array {
  const encoder = new TextEncoder();
  const files: Record<string, Uint8Array> = {};
  for (const [sheet, csv] of Object.entries(farmExportToCsvSheets(bundle))) {
    files[SHEET_FILENAMES[sheet] || `${sheet}.csv`] = encoder.encode(UTF8_BOM + csv);
  }
  return zipSync(files);
}

/** Sheet names present in an export built from this bundle. */
export function farmExportSheetNames(bundle: FarmExportV1): string[] {
  const names = ['Diary'];
  if (bundle.exportScope.issues && bundle.issues.length > 0) names.push('Issues');
  if (bundle.exportScope.issuesArchive && bundle.issuesArchive.length > 0) {
    names.push('IssuesArchive');
  }
  names.push('_Meta');
  return names;
}

export async function downloadFarmExportSheets(
  farmId: string,
  opts?: BuildFarmExportOpts
): Promise<{ bundle: FarmExportV1; filename: string; bytes: Uint8Array }> {
  const bundle = await buildFarmExportJson(farmId, opts);
  const bytes = farmExportToSheetsZip(bundle);
  const { sheetsFilename } = farmExportFilenames(opts?.farmName, farmId, bundle.exportedAt);
  downloadBytes(bytes, sheetsFilename, 'application/zip');
  return { bundle, filename: sheetsFilename, bytes };
}

/**
 * The diary on its own, as a plain `.csv`.
 *
 * The diary page exports only diary rows, so zipping produced an archive of one
 * real file — and on the Android tablet a zip cannot be opened in Sheets at all
 * without a separate unzip app. The multi-sheet zip above is still right for
 * the full farm export, where there genuinely are several sheets.
 */
export async function downloadFarmExportDiaryCsv(
  farmId: string,
  opts?: Omit<BuildFarmExportOpts, 'includeIssues' | 'includeIssuesArchive'>
): Promise<{ bundle: FarmExportV1; filename: string; csv: string }> {
  const bundle = await buildFarmExportJson(farmId, {
    ...opts,
    includeIssues: false,
    includeIssuesArchive: false,
  });
  const csv = farmExportToCsvSheets(bundle).Diary as string;
  const { diaryCsvFilename } = farmExportFilenames(opts?.farmName, farmId, bundle.exportedAt);
  downloadBlob(
    new Blob([UTF8_BOM + csv], { type: 'text/csv;charset=utf-8' }),
    diaryCsvFilename
  );
  return { bundle, filename: diaryCsvFilename, csv };
}
