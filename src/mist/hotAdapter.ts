/**
 * Adapter: farm-export envelope → mist HotState (single hot/current blob).
 *
 * Hot records wrap export-shaped payloads so one schema serves export and mist.
 *
 * @see Plans/FARM_EXPORT_JSON_XLSX.md
 * @see Plans/MIST_NETWORK_STORAGE.md § Hot
 */

import type { HotRecord, HotState } from '../../units/mist-freenet/src/seal-hot.ts';
import type { FarmExportDiaryEvent, FarmExportIssue, FarmExportV1 } from '../lib/farmExport';

export const HOT_WINDOW_DAYS = 90;

/** UTC midnight at start of the rolling hot window (default 90 days). */
export function hotWindowStart(now = Date.now()): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - HOT_WINDOW_DAYS);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export function diaryToHotRecord(event: FarmExportDiaryEvent, defaultAuthor: string): HotRecord {
  const ts = event.updatedAt || `${event.date}T12:00:00.000Z`;
  return {
    id: event.id,
    type: event.type,
    ts,
    author: event.assignedTo || defaultAuthor,
    payload: event,
  };
}

export function issueToHotRecord(issue: FarmExportIssue, archived: boolean): HotRecord {
  const ts = issue.updatedAt || issue.reportedAt;
  return {
    id: issue.id,
    type: archived ? 'issue_archived' : 'issue',
    ts,
    author: issue.reportedBy,
    payload: issue,
  };
}

export type BuildHotStateOpts = {
  now?: number;
  /** Preserve window/tombstones from an existing hot blob when re-publishing. */
  previous?: Pick<HotState, 'window_start' | 'tombstones' | 'last_sealed'> | null;
  defaultAuthor?: string;
};

/** Build HotState from a farm-export envelope (full local snapshot replace in v1). */
export function buildHotStateFromFarmExport(
  exportBundle: FarmExportV1,
  opts?: BuildHotStateOpts,
): HotState {
  const author = opts?.defaultAuthor || exportBundle.farmName || 'local';
  const records: HotRecord[] = [
    ...exportBundle.diary.map((e) => diaryToHotRecord(e, author)),
    ...exportBundle.issues.map((i) => issueToHotRecord(i, false)),
    ...exportBundle.issuesArchive.map((i) => issueToHotRecord(i, true)),
  ];
  records.sort((a, b) => b.ts.localeCompare(a.ts));

  const prev = opts?.previous;

  return {
    farm_id: exportBundle.farmId,
    window_start: prev?.window_start ?? hotWindowStart(opts?.now),
    records,
    tombstones: prev?.tombstones ?? [],
    last_sealed: prev?.last_sealed ?? null,
  };
}
