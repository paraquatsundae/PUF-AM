/**
 * Adapter: farm-export envelope → mist HotState (single hot/current blob).
 *
 * Hot records wrap export-shaped payloads so one schema serves export and mist.
 *
 * @see Plans/FARM_EXPORT_JSON_XLSX.md
 * @see Plans/reference/MIST_NETWORK_STORAGE.md § Hot
 */

import { sha256Hex } from '../../units/mist-freenet/src/hash.ts';
import type { HotRecord, HotState } from '../../units/mist-freenet/src/seal-hot.ts';
import type { DiaryEvent } from '../lib/farmDiary';
import type { FieldIssue } from '../lib/fieldStore';
import type { FarmExportDiaryEvent, FarmExportIssue, FarmExportV1 } from '../lib/farmExport';
import {
  MAP_HIGHLIGHT_HOT_TYPE,
  type MapHighlightDoc,
} from '../lib/mapHighlights';
import type { FarmChatHotLine, FarmChatHotPayload } from './hotFarmChatBridge.ts';

export const FARM_CHAT_HOT_TYPE = 'farm_chat';

export const HOT_WINDOW_DAYS = 90;

export const DIARY_HOT_RECORD_TYPES = new Set<DiaryEvent['type']>([
  'spray',
  'irrigation',
  'work',
  'nutrition',
]);

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

export function farmChatLinesToHotRecord(
  messages: FarmChatHotLine[],
  extra?: Omit<FarmChatHotPayload, 'messages'>,
): HotRecord {
  const last = messages[messages.length - 1];
  return {
    id: FARM_CHAT_HOT_TYPE,
    type: FARM_CHAT_HOT_TYPE,
    ts: last?.at ?? new Date(0).toISOString(),
    author: last?.authorName ?? 'Crew',
    payload: {
      messages,
      ...(extra?.dayDate ? { dayDate: extra.dayDate } : {}),
      ...(extra?.dayMessages?.length ? { dayMessages: extra.dayMessages } : {}),
      ...(extra?.archives?.length ? { archives: extra.archives } : {}),
    },
  };
}

/** SHA-256 of the farm_chat payload (live + day + archive index) — watch ping. */
export function farmChatLinesHash(
  messages: readonly FarmChatHotLine[],
  extra?: Omit<FarmChatHotPayload, 'messages'>,
): string {
  return sha256Hex(
    new TextEncoder().encode(
      JSON.stringify({
        messages,
        dayDate: extra?.dayDate ?? '',
        dayMessages: extra?.dayMessages ?? [],
        archives: extra?.archives ?? [],
      }),
    ),
  );
}

function asChatLine(row: unknown): FarmChatHotLine | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.at !== 'string') return null;
  if (typeof r.text !== 'string' || typeof r.authorName !== 'string') return null;
  return {
    id: r.id,
    at: r.at,
    authorName: r.authorName,
    text: r.text,
    ...(typeof r.authorUid === 'string' ? { authorUid: r.authorUid } : {}),
  };
}

export function farmChatLinesFromHotRecord(record: HotRecord): FarmChatHotLine[] {
  return farmChatPayloadFromHotRecord(record).messages;
}

export function farmChatPayloadFromHotRecord(record: HotRecord): FarmChatHotPayload {
  if (record.type !== FARM_CHAT_HOT_TYPE) return { messages: [] };
  const payload = record.payload as Record<string, unknown> | null;
  const messages: FarmChatHotLine[] = [];
  if (Array.isArray(payload?.messages)) {
    for (const row of payload.messages) {
      const line = asChatLine(row);
      if (line) messages.push(line);
    }
  }
  const dayMessages: FarmChatHotLine[] = [];
  if (Array.isArray(payload?.dayMessages)) {
    for (const row of payload.dayMessages) {
      const line = asChatLine(row);
      if (line) dayMessages.push(line);
    }
  }
  const archives = Array.isArray(payload?.archives)
    ? payload.archives.flatMap((row) => {
        if (!row || typeof row !== 'object') return [];
        const r = row as Record<string, unknown>;
        if (typeof r.date !== 'string') return [];
        return [
          {
            date: r.date,
            contentHash: typeof r.contentHash === 'string' ? r.contentHash : '',
            ...(typeof r.uri === 'string' && r.uri.trim() ? { uri: r.uri.trim() } : {}),
          },
        ];
      })
    : [];
  return {
    messages,
    ...(typeof payload?.dayDate === 'string' ? { dayDate: payload.dayDate } : {}),
    ...(dayMessages.length ? { dayMessages } : {}),
    ...(archives.length ? { archives } : {}),
  };
}

export function highlightToHotRecord(highlight: MapHighlightDoc): HotRecord {
  const ts = highlight.updatedAt || highlight.createdAt;
  return {
    id: highlight.id,
    type: MAP_HIGHLIGHT_HOT_TYPE,
    ts,
    author: highlight.directedAtName || highlight.displayName || highlight.createdBy,
    payload: highlight,
  };
}

export type BuildHotStateOpts = {
  now?: number;
  /** Preserve window/tombstones from an existing hot blob when re-publishing. */
  previous?: Pick<HotState, 'window_start' | 'tombstones' | 'last_sealed'> | null;
  defaultAuthor?: string;
  /**
   * Hybrid farms (`Plans/FREENET_NETWORK_PACK.md` §3): the envelope was built
   * from a *Firestore* farm's local cache, so `exportBundle.farmId` is the cloud
   * id. The Hot is addressed and sealed under the **mist** FarmId instead, and
   * remembers where it came from in `meta.cloud_farm_id`.
   */
  farmId?: string;
  cloudFarmId?: string;
  /**
   * Timed map highlights from `pufom_farm_local` kind `map_highlights`.
   * Not part of farm-export.json v1 — they ride in Hot only
   * (`Plans/FREENET_OPERATOR_FLOW.md` §9.2).
   */
  mapHighlights?: MapHighlightDoc[];
  /**
   * Whole-farm chat (last N). Freenet-native only — hybrid mirrors stay
   * Firestore-authoritative (`Plans/FARM_MESSAGING.md`).
   */
  farmChat?: FarmChatHotLine[];
  farmChatExtra?: Omit<FarmChatHotPayload, 'messages'>;
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
    ...(opts?.mapHighlights ?? []).map((h) => highlightToHotRecord(h)),
    ...(opts?.farmChat &&
    (opts.farmChat.length || opts.farmChatExtra?.archives?.length || opts.farmChatExtra?.dayMessages?.length)
      ? [farmChatLinesToHotRecord(opts.farmChat, opts.farmChatExtra)]
      : []),
  ];
  records.sort((a, b) => b.ts.localeCompare(a.ts));

  const prev = opts?.previous;
  const cloudFarmId = opts?.cloudFarmId?.trim();

  return {
    farm_id: opts?.farmId?.trim() || exportBundle.farmId,
    window_start: prev?.window_start ?? hotWindowStart(opts?.now),
    records,
    tombstones: prev?.tombstones ?? [],
    last_sealed: prev?.last_sealed ?? null,
    ...(cloudFarmId ? { meta: { cloud_farm_id: cloudFarmId } } : {}),
  };
}

/** The Firestore farm a Hot blob mirrors, or `null` for a Freenet-native farm. */
export function hotStateCloudFarmId(hot: Pick<HotState, 'meta'> | null | undefined): string | null {
  const id = hot?.meta?.cloud_farm_id;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

function exportDiaryToDiaryEvent(row: FarmExportDiaryEvent): DiaryEvent {
  const { blockName: _blockName, ...rest } = row;
  return rest as DiaryEvent;
}

function exportIssueToFieldIssue(row: FarmExportIssue): FieldIssue {
  const { hasPhoto: _hasPhoto, ...rest } = row;
  return rest as FieldIssue;
}

export type HotFarmEntities = {
  diary: DiaryEvent[];
  issues: FieldIssue[];
  issuesArchive: FieldIssue[];
  highlights: MapHighlightDoc[];
  chat?: FarmChatHotLine[];
  chatPayload?: FarmChatHotPayload;
};

function asMapHighlight(payload: unknown): MapHighlightDoc | null {
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as MapHighlightDoc;
  if (!row.id || !row.geojson || !row.expiresAt) return null;
  return row;
}

/** Inverse of `buildHotStateFromFarmExport` — Hot records → local entity rows. */
export function hotStateToFarmEntities(hot: HotState): HotFarmEntities {
  const diary: DiaryEvent[] = [];
  const issues: FieldIssue[] = [];
  const issuesArchive: FieldIssue[] = [];
  const highlights: MapHighlightDoc[] = [];
  let chat: FarmChatHotLine[] | undefined;
  let chatPayload: FarmChatHotPayload | undefined;

  for (const record of hot.records) {
    if (DIARY_HOT_RECORD_TYPES.has(record.type as DiaryEvent['type'])) {
      diary.push(exportDiaryToDiaryEvent(record.payload as FarmExportDiaryEvent));
      continue;
    }
    if (record.type === 'issue') {
      issues.push(exportIssueToFieldIssue(record.payload as FarmExportIssue));
      continue;
    }
    if (record.type === 'issue_archived') {
      issuesArchive.push(exportIssueToFieldIssue(record.payload as FarmExportIssue));
      continue;
    }
    if (record.type === MAP_HIGHLIGHT_HOT_TYPE) {
      const highlight = asMapHighlight(record.payload);
      if (highlight) highlights.push(highlight);
      continue;
    }
    if (record.type === FARM_CHAT_HOT_TYPE) {
      const payload = farmChatPayloadFromHotRecord(record);
      chat = payload.messages;
      chatPayload = payload;
    }
  }

  return {
    diary,
    issues,
    issuesArchive,
    highlights,
    ...(chat ? { chat } : {}),
    ...(chatPayload ? { chatPayload } : {}),
  };
}

export function countHotFarmEntities(hot: HotState): {
  diary: number;
  issues: number;
  issuesArchive: number;
  highlights: number;
  chat: number;
  records: number;
} {
  const entities = hotStateToFarmEntities(hot);
  return {
    diary: entities.diary.length,
    issues: entities.issues.length,
    issuesArchive: entities.issuesArchive.length,
    highlights: entities.highlights.length,
    chat: entities.chat?.length ?? 0,
    records: hot.records.length,
  };
}
