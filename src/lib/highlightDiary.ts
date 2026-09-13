/**
 * Map “check this” + instructions → farm diary work plan.
 * Same Hot generation as the highlight so one ping delivers both.
 *
 * @see Plans/FREENET_OPERATOR_FLOW.md §9 Decision 2026-09-12 (highlight diary)
 */
import type { DiaryEvent } from './farmDiaryTypes';
import { todayInputDate } from './farmDiaryView';
import {
  upsertLocalHighlight,
  type MapHighlightDoc,
} from './mapHighlights';
import { upsertLocalEntity } from './localFarmRepo';

export function highlightHasTask(input: {
  note?: string | null;
  directedAtName?: string | null;
}): boolean {
  return Boolean((input.note || '').trim() || (input.directedAtName || '').trim());
}

export function newDiaryEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `de-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function highlightDiaryPath(eventId: string): string {
  return `/diary?event=${encodeURIComponent(eventId)}`;
}

export function buildHighlightWorkEvent(input: {
  highlightId: string;
  diaryEventId?: string;
  date?: string;
  note?: string;
  createdBy: string;
  createdByName: string;
  assignedTo?: string;
  assignedToName?: string;
  nowMs?: number;
}): DiaryEvent {
  const nowMs = input.nowMs ?? Date.now();
  const createdAt = new Date(nowMs).toISOString();
  const notes = (input.note || '').trim();
  const assignedName = (input.assignedToName || '').trim();
  const assignedUid = (input.assignedTo || '').trim();
  const title = notes
    ? notes.length > 80
      ? `${notes.slice(0, 77)}…`
      : notes
    : 'Check this';
  return {
    id: input.diaryEventId || newDiaryEventId(),
    date: input.date || todayInputDate(new Date(nowMs)),
    type: 'work',
    status: 'planned',
    title,
    createdBy: input.createdBy,
    createdByName: (input.createdByName || 'Crew').slice(0, 100),
    linkedHighlightId: input.highlightId,
    updatedAt: createdAt,
    ...(notes ? { notes } : {}),
    ...(assignedUid ? { assignedTo: assignedUid } : {}),
    ...(assignedName ? { assignedToName: assignedName } : {}),
  };
}

export function attachDiaryToHighlight(
  highlight: MapHighlightDoc,
  diaryEventId: string
): MapHighlightDoc {
  return { ...highlight, linkedDiaryEventId: diaryEventId };
}

export function planHighlightDiary(
  highlight: MapHighlightDoc,
  nowMs?: number
): DiaryEvent | null {
  if (!highlightHasTask(highlight)) return null;
  return buildHighlightWorkEvent({
    highlightId: highlight.id,
    note: highlight.note,
    createdBy: highlight.createdBy,
    createdByName: highlight.displayName,
    assignedTo: highlight.directedAtUid,
    assignedToName: highlight.directedAtName,
    nowMs,
  });
}

export async function persistHighlightAndDiary(
  farmId: string,
  highlight: MapHighlightDoc,
  diary: DiaryEvent | null,
  opts: { queueCloud: boolean }
): Promise<{ highlight: MapHighlightDoc; diary: DiaryEvent | null }> {
  const stored = diary ? attachDiaryToHighlight(highlight, diary.id) : highlight;
  if (diary) {
    await Promise.all([
      upsertLocalHighlight(farmId, stored),
      upsertLocalEntity(farmId, 'diary', diary, { queueCloud: opts.queueCloud }),
    ]);
  } else {
    await upsertLocalHighlight(farmId, stored);
  }
  return { highlight: stored, diary };
}
