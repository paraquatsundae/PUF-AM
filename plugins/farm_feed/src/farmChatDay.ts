/**
 * Farm-local calendar day + today's chat buffer.
 * Timezone is Australia/Perth (no farm TZ field exists).
 * Plans/FARM_MESSAGING.md
 */
import {
  FARM_CHAT_DAY_CAP,
  FARM_CHAT_LIVE_CAP,
  mergeFarmChatLogs,
  parseFarmChatMessages,
  trimFarmChat,
  type FarmChatMessage,
} from './farmChatLog';

export const FARM_CHAT_TZ = 'Australia/Perth';
export const FARM_CHAT_DAY_KEY_PREFIX = 'pufam.farmChat.day.v1.';
export const FARM_CHAT_ARCHIVE_INDEX_KEY_PREFIX = 'pufam.farmChat.archiveIndex.v1.';

export type FarmChatDayBuffer = {
  date: string;
  messages: FarmChatMessage[];
};

export type FarmChatArchiveRef = {
  date: string;
  contentHash: string;
  uri?: string;
};

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function farmChatDayKey(farmId: string): string {
  return `${FARM_CHAT_DAY_KEY_PREFIX}${farmId}`;
}

export function farmChatArchiveIndexKey(farmId: string): string {
  return `${FARM_CHAT_ARCHIVE_INDEX_KEY_PREFIX}${farmId}`;
}

/** yyyy-mm-dd in Australia/Perth. ISO `at` uses the instant, not UTC's date. */
export function farmChatCalendarDate(at: string | number | Date = Date.now()): string {
  const d = typeof at === 'string' || typeof at === 'number' ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FARM_CHAT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function farmChatDayRolled(dayDate: string, today = farmChatCalendarDate()): boolean {
  return Boolean(dayDate && today && dayDate < today);
}

export function readFarmChatDay(farmId: string): FarmChatDayBuffer | null {
  if (!farmId) return null;
  const raw = storage()?.getItem(farmChatDayKey(farmId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { date?: unknown; messages?: unknown };
    if (typeof parsed.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) return null;
    return {
      date: parsed.date,
      messages: parseFarmChatMessages(parsed.messages, FARM_CHAT_DAY_CAP),
    };
  } catch {
    return null;
  }
}

export function writeFarmChatDay(farmId: string, day: FarmChatDayBuffer): void {
  try {
    storage()?.setItem(
      farmChatDayKey(farmId),
      JSON.stringify({
        date: day.date,
        messages: trimFarmChat(day.messages, FARM_CHAT_DAY_CAP),
      })
    );
  } catch {
    /* quota / private mode */
  }
}

export function appendFarmChatDay(
  day: FarmChatDayBuffer | null,
  message: FarmChatMessage,
  today = farmChatCalendarDate(message.at)
): FarmChatDayBuffer {
  if (!day || farmChatDayRolled(day.date, today)) {
    return { date: today, messages: [message] };
  }
  return {
    date: day.date,
    messages: mergeFarmChatLogs(day.messages, [message], FARM_CHAT_DAY_CAP),
  };
}

export function readFarmChatArchiveIndex(farmId: string): FarmChatArchiveRef[] {
  if (!farmId) return [];
  const raw = storage()?.getItem(farmChatArchiveIndexKey(farmId));
  if (!raw) return [];
  try {
    return parseFarmChatArchiveIndex(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function parseFarmChatArchiveIndex(raw: unknown): FarmChatArchiveRef[] {
  const rows = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray((raw as { dates?: unknown }).dates)
    ? (raw as { dates: unknown[] }).dates
    : [];
  const out: FarmChatArchiveRef[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (typeof row === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row) && !seen.has(row)) {
      seen.add(row);
      out.push({ date: row, contentHash: '' });
      continue;
    }
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || seen.has(r.date)) continue;
    seen.add(r.date);
    out.push({
      date: r.date,
      contentHash: typeof r.contentHash === 'string' ? r.contentHash.slice(0, 64) : '',
      ...(typeof r.uri === 'string' && r.uri.trim() ? { uri: r.uri.trim() } : {}),
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 400);
}

export function writeFarmChatArchiveIndex(farmId: string, refs: readonly FarmChatArchiveRef[]): void {
  try {
    storage()?.setItem(farmChatArchiveIndexKey(farmId), JSON.stringify(parseFarmChatArchiveIndex(refs)));
  } catch {
    /* quota */
  }
}

/**
 * Union today's buffer. Do not replace local with a stale Hot last-writer.
 * Same date → merge by id. Newer incoming date → take it (local yesterday
 * stays in the archive path). Older incoming date → ignore.
 */
export function mergeFarmChatDayIncoming(
  local: FarmChatDayBuffer | null,
  incomingDate: string | undefined,
  incomingMessages: readonly FarmChatMessage[] | undefined
): FarmChatDayBuffer | null {
  if (!incomingDate) {
    if (!incomingMessages?.length) return local;
    const folded = incomingMessages.reduce(
      (day, row) => appendFarmChatDay(day, row, farmChatCalendarDate(row.at)),
      local
    );
    return folded;
  }
  if (!local) {
    return { date: incomingDate, messages: trimFarmChat(incomingMessages ?? [], FARM_CHAT_DAY_CAP) };
  }
  if (incomingDate > local.date) {
    return {
      date: incomingDate,
      messages: trimFarmChat(incomingMessages ?? [], FARM_CHAT_DAY_CAP),
    };
  }
  if (incomingDate < local.date) return local;
  return {
    date: local.date,
    messages: mergeFarmChatLogs(local.messages, incomingMessages ?? [], FARM_CHAT_DAY_CAP),
  };
}

export function farmChatIds(rows: readonly FarmChatMessage[]): Set<string> {
  return new Set(rows.map((row) => row.id));
}

/** True when this device still has lines the incoming Hot blob omitted. */
export function farmChatHasLocalOnly(
  localLive: readonly FarmChatMessage[],
  localDay: FarmChatDayBuffer | null,
  incomingLive: readonly FarmChatMessage[],
  incomingDay: readonly FarmChatMessage[] | undefined
): boolean {
  const incoming = farmChatIds([...incomingLive, ...(incomingDay ?? [])]);
  if (incoming.size === 0) return false;
  return [...localLive, ...(localDay?.messages ?? [])].some((row) => !incoming.has(row.id));
}

export function mergeFarmChatArchiveIndex(
  local: readonly FarmChatArchiveRef[],
  incoming: readonly FarmChatArchiveRef[]
): FarmChatArchiveRef[] {
  const byDate = new Map<string, FarmChatArchiveRef>();
  for (const row of [...local, ...incoming]) {
    const prev = byDate.get(row.date);
    if (!prev || (row.contentHash && !prev.contentHash) || (row.uri && !prev.uri)) {
      byDate.set(row.date, { ...prev, ...row });
    }
  }
  return parseFarmChatArchiveIndex([...byDate.values()]);
}

export function visibleFarmChat(messages: readonly FarmChatMessage[]): FarmChatMessage[] {
  return trimFarmChat(messages, FARM_CHAT_LIVE_CAP);
}

/** Split a pre-cap-5 local cache so today's lines stay in the day buffer. */
export function adoptLegacyFarmChatCache(
  rows: readonly FarmChatMessage[],
  today = farmChatCalendarDate()
): { live: FarmChatMessage[]; day: FarmChatDayBuffer; pendingArchive: Map<string, FarmChatMessage[]> } {
  const pendingArchive = new Map<string, FarmChatMessage[]>();
  const todays: FarmChatMessage[] = [];
  for (const row of rows) {
    const date = farmChatCalendarDate(row.at);
    if (!date) continue;
    if (date === today) {
      todays.push(row);
      continue;
    }
    if (date < today) {
      const list = pendingArchive.get(date) ?? [];
      list.push(row);
      pendingArchive.set(date, list);
    }
  }
  return {
    live: visibleFarmChat(rows),
    day: { date: today, messages: trimFarmChat(todays, FARM_CHAT_DAY_CAP) },
    pendingArchive,
  };
}
