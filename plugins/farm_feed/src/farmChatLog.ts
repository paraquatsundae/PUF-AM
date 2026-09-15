/**
 * Whole-farm chat log — cap, trim, local cache.
 * All-farm broadcast only. No DMs. No photos. Never FarmSeed.
 * Plans/FARM_MESSAGING.md · Plans/FIREBASE_BILLING.md
 */

export const FARM_CHAT_CAP = 80;
export const FARM_CHAT_TEXT_MAX = 400;
export const FARM_CHAT_AUTHOR_MAX = 80;
export const FARM_CHAT_LOCAL_KEY_PREFIX = 'pufam.farmChat.log.v1.';
export const FARM_CHAT_CHANGED_EVENT = 'pufam-farm-chat-changed';

export type FarmChatMessage = {
  id: string;
  at: string;
  authorName: string;
  text: string;
  authorUid?: string;
};

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function farmChatLocalKey(farmId: string): string {
  return `${FARM_CHAT_LOCAL_KEY_PREFIX}${farmId}`;
}

/** Refuse FarmSeed / FarmCode / invite material on a chat line. */
export function farmChatLooksSecret(text: string): boolean {
  return /mist-fc-|FarmSeed|BonesKey|InviteToken/i.test(text);
}

export function sanitizeFarmChatText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, FARM_CHAT_TEXT_MAX);
}

export function farmChatAuthorName(name: string): string {
  const trimmed = name.trim().slice(0, FARM_CHAT_AUTHOR_MAX);
  if (!trimmed || farmChatLooksSecret(trimmed)) return 'Crew';
  return trimmed;
}

export function parseFarmChatMessages(raw: unknown): FarmChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: FarmChatMessage[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.at !== 'string') continue;
    if (typeof r.text !== 'string' || typeof r.authorName !== 'string') continue;
    if (farmChatLooksSecret(r.text) || farmChatLooksSecret(r.authorName)) continue;
    const text = sanitizeFarmChatText(r.text);
    if (!text) continue;
    const authorUid =
      typeof r.authorUid === 'string' && r.authorUid.trim() && !farmChatLooksSecret(r.authorUid)
        ? r.authorUid.trim().slice(0, 80)
        : undefined;
    out.push({
      id: r.id.slice(0, 80),
      at: r.at.slice(0, 40),
      authorName: farmChatAuthorName(r.authorName),
      text,
      ...(authorUid ? { authorUid } : {}),
    });
  }
  return trimFarmChat(out);
}

export function trimFarmChat(
  messages: readonly FarmChatMessage[],
  cap = FARM_CHAT_CAP
): FarmChatMessage[] {
  const sorted = [...messages].sort((a, b) => a.at.localeCompare(b.at));
  return sorted.length <= cap ? sorted : sorted.slice(-cap);
}

export function appendFarmChat(
  messages: readonly FarmChatMessage[],
  next: FarmChatMessage,
  cap = FARM_CHAT_CAP
): FarmChatMessage[] {
  if (messages.some((row) => row.id === next.id)) return trimFarmChat(messages, cap);
  return trimFarmChat([...messages, next], cap);
}

export function mergeFarmChatLogs(
  local: readonly FarmChatMessage[],
  incoming: readonly FarmChatMessage[],
  cap = FARM_CHAT_CAP
): FarmChatMessage[] {
  const byId = new Map<string, FarmChatMessage>();
  for (const row of local) byId.set(row.id, row);
  for (const row of incoming) {
    const prev = byId.get(row.id);
    if (!prev || row.at >= prev.at) byId.set(row.id, row);
  }
  return trimFarmChat([...byId.values()], cap);
}

export function buildFarmChatMessage(input: {
  text: string;
  authorName: string;
  authorUid?: string | null;
  at?: string;
  id?: string;
}): FarmChatMessage | null {
  const text = sanitizeFarmChatText(input.text);
  if (!text || farmChatLooksSecret(text)) return null;
  const authorName = farmChatAuthorName(input.authorName);
  return {
    id: (input.id || `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`).slice(
      0,
      80
    ),
    at: input.at || new Date().toISOString(),
    authorName,
    text,
    ...(input.authorUid?.trim() ? { authorUid: input.authorUid.trim().slice(0, 80) } : {}),
  };
}

export function listFarmChat(farmId: string | null | undefined): FarmChatMessage[] {
  if (!farmId) return [];
  const raw = storage()?.getItem(farmChatLocalKey(farmId));
  if (!raw) return [];
  try {
    return parseFarmChatMessages(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeFarmChatLocal(farmId: string, messages: readonly FarmChatMessage[]): void {
  const trimmed = trimFarmChat(messages);
  try {
    storage()?.setItem(farmChatLocalKey(farmId), JSON.stringify(trimmed));
  } catch {
    /* quota / private mode */
  }
}

export function mergeFarmChatFromRemote(farmId: string, incoming: readonly FarmChatMessage[]): FarmChatMessage[] {
  const merged = mergeFarmChatLogs(listFarmChat(farmId), incoming);
  writeFarmChatLocal(farmId, merged);
  notifyFarmChatChanged(farmId);
  return merged;
}

export function notifyFarmChatChanged(farmId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(FARM_CHAT_CHANGED_EVENT, { detail: { farmId } }));
}

/**
 * Bones lesson: never advertise a new hash with an old URI (or the reverse).
 * Chat rides the existing Hot watch — this only checks the pair is complete.
 */
export function farmChatHotWatchPairOk(pair: {
  hotContentHash?: string | null;
  hotUri?: string | null;
}): boolean {
  const hash = pair.hotContentHash?.trim() ?? '';
  const uri = pair.hotUri?.trim() ?? '';
  if (!hash && !uri) return true;
  return Boolean(hash && uri);
}
