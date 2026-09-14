/**
 * This node's contract PUT/GET/subscribe — log parse + host-callback events.
 *
 * Honest model: this node ↔ network. Do not invent inter-peer hops.
 * Skip Opennet relay / neighbor-hosting (those would keep the ring flashing).
 *
 * Plans/FREENET_NETWORK_PACK.md Decision — 2026-09-14 (Settings Freenet traffic).
 */

export const FREENET_CONTRACT_TRAFFIC_MAX = 8;
export const FREENET_CONTRACT_TRAFFIC_FRESH_MS = 16_000;
export const FREENET_CONTRACT_TRAFFIC_FADE_MS = 4_000;
export const FREENET_CONTRACT_TRAFFIC_DEDUP_MS = 2_500;

export type FreenetContractOp = 'put' | 'get' | 'subscribe';
export type FreenetContractSlotKind = 'hot' | 'bones' | 'watch' | 'photo' | 'invite' | 'unknown';
export type FreenetContractTrafficSource = 'log' | 'host';
export type FreenetContractDirection = 'in' | 'out';

export type FreenetContractTrafficEvent = {
  id: string;
  at: number;
  op: FreenetContractOp;
  direction: FreenetContractDirection;
  slotKind: FreenetContractSlotKind;
  label: string;
  source: FreenetContractTrafficSource;
  contractKey?: string;
  peerId?: string;
};

export type ParseFreenetLogContractOptions = {
  nowMs?: number;
  freshMs?: number | null;
  fileMtimeMs?: number;
};

const TS_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/;
const CONTRACT_RE = /\b(?:contract|contract_key|key)=([A-Za-z0-9]{8,})\b/;
const PEER_RE = /\bpeer=([A-Za-z0-9.:_-]+)\b/;
const REQ_RE = /\brequest_id=([A-Za-z0-9_-]+)\b/;
const TX_RE = /\btx=([A-Za-z0-9]+)\b/;

const RELAY_OR_NEIGHBOR =
  /NEIGHBOR_HOSTING|GET relay|PUT relay|SUBSCRIBE relay|UPDATE relay|relay_subscribe|relay_streaming|auto-fetch/i;

const SLOT_KINDS: readonly FreenetContractSlotKind[] = [
  'hot',
  'bones',
  'watch',
  'photo',
  'invite',
  'unknown',
];

function lineTimeMs(line: string): number | undefined {
  const match = TS_RE.exec(line.trim());
  if (!match) return undefined;
  const stamp = match[1].endsWith('Z') ? match[1] : `${match[1]}Z`;
  const ms = Date.parse(stamp);
  return Number.isFinite(ms) ? ms : undefined;
}

function isFresh(at: number, options: ParseFreenetLogContractOptions): boolean {
  const freshMs =
    options.freshMs === undefined ? FREENET_CONTRACT_TRAFFIC_FRESH_MS : options.freshMs;
  if (freshMs === null) return true;
  const nowMs = options.nowMs ?? Date.now();
  return nowMs - at <= freshMs;
}

export function freenetContractDirection(op: FreenetContractOp): FreenetContractDirection {
  return op === 'put' ? 'out' : 'in';
}

export function freenetContractTrafficLabel(
  op: FreenetContractOp,
  slotKind: FreenetContractSlotKind = 'unknown',
): string {
  const noun =
    slotKind === 'hot'
      ? 'Hot'
      : slotKind === 'bones'
        ? 'Bones'
        : slotKind === 'watch'
          ? 'watch'
          : slotKind === 'photo'
            ? 'photo'
            : slotKind === 'invite'
              ? 'invite'
              : 'contract';
  if (op === 'put') return `Sent ${noun}`;
  if (op === 'subscribe') return slotKind === 'unknown' ? 'Subscribed' : `Subscribed ${noun}`;
  return `Fetched ${noun}`;
}

/** Mist storage key or a host `identifier` → slot kind. Slots without a key stay unknown. */
export function slotKindFromStorageKey(key?: string | null): FreenetContractSlotKind {
  if (!key) return 'unknown';
  if (key.includes('/hot/photo') || key.includes('/hot/photos') || key.endsWith('/photos')) {
    return 'photo';
  }
  if (key.includes('/bones/')) return 'bones';
  if (key.includes('/hot/')) return 'hot';
  return 'unknown';
}

export function isFreenetContractSlotKind(value: unknown): value is FreenetContractSlotKind {
  return typeof value === 'string' && (SLOT_KINDS as readonly string[]).includes(value);
}

export function createFreenetContractTrafficEvent(input: {
  op: FreenetContractOp;
  source: FreenetContractTrafficSource;
  slotKind?: FreenetContractSlotKind;
  at?: number;
  id?: string;
  contractKey?: string;
  peerId?: string;
}): FreenetContractTrafficEvent {
  const slotKind = input.slotKind ?? 'unknown';
  const at = input.at ?? Date.now();
  const id =
    input.id ??
    `${input.source}-${at}-${input.op}-${input.contractKey ?? slotKind}`;
  return {
    id,
    at,
    op: input.op,
    direction: freenetContractDirection(input.op),
    slotKind,
    label: freenetContractTrafficLabel(input.op, slotKind),
    source: input.source,
    ...(input.contractKey ? { contractKey: input.contractKey } : {}),
    ...(input.peerId ? { peerId: input.peerId } : {}),
  };
}

/**
 * This node's WS client PUT/GET, or a non-relay PUT the node originated.
 * HTML, neighbor hosting, and relay/auto-fetch lines are ignored.
 */
export function parseFreenetLogContractLine(
  line: string,
  options: ParseFreenetLogContractOptions = {},
): FreenetContractTrafficEvent | null {
  if (!line || line.trimStart().startsWith('<')) return null;
  if (RELAY_OR_NEIGHBOR.test(line)) return null;

  let op: FreenetContractOp | null = null;
  if (line.includes('process_client_request')) {
    op = /\bPut\b|\bPUT\b/.test(line) ? 'put' : 'get';
  } else if (
    /freenet::operations::put/.test(line) &&
    /contract=/.test(line) &&
    !/PUT relay/i.test(line)
  ) {
    op = 'put';
  } else {
    return null;
  }

  const contractKey = CONTRACT_RE.exec(line)?.[1];
  const rawPeer = PEER_RE.exec(line)?.[1];
  const peerId = rawPeer && !rawPeer.startsWith('127.') ? rawPeer : undefined;
  const at = lineTimeMs(line) ?? options.fileMtimeMs ?? options.nowMs ?? Date.now();
  if (!isFresh(at, options)) return null;

  const req = REQ_RE.exec(line)?.[1];
  const tx = TX_RE.exec(line)?.[1];
  return createFreenetContractTrafficEvent({
    op,
    source: 'log',
    at,
    id: req ? `log-${req}` : tx ? `log-${tx}` : undefined,
    ...(contractKey ? { contractKey } : {}),
    ...(peerId ? { peerId } : {}),
  });
}

export function parseFreenetLogContractTraffic(
  text: string,
  options: ParseFreenetLogContractOptions = {},
): FreenetContractTrafficEvent[] {
  if (!text || text.trimStart().startsWith('<')) return [];
  const found: FreenetContractTrafficEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    const hit = parseFreenetLogContractLine(line, options);
    if (hit) found.push(hit);
  }
  return mergeFreenetContractTraffic(found, options.nowMs ?? Date.now());
}

function kindRank(kind: FreenetContractSlotKind): number {
  return kind === 'unknown' ? 0 : 1;
}

function sourceRank(source: FreenetContractTrafficSource): number {
  return source === 'host' ? 1 : 0;
}

function sameTraffic(a: FreenetContractTrafficEvent, b: FreenetContractTrafficEvent): boolean {
  if (a.id === b.id) return true;
  if (a.op !== b.op) return false;
  if (Math.abs(a.at - b.at) > FREENET_CONTRACT_TRAFFIC_DEDUP_MS) return false;
  if (a.contractKey && b.contractKey) return a.contractKey === b.contractKey;
  if (a.slotKind !== 'unknown' && a.slotKind === b.slotKind) return true;
  return !a.contractKey && !b.contractKey && a.source !== b.source;
}

function preferTraffic(
  a: FreenetContractTrafficEvent,
  b: FreenetContractTrafficEvent,
): FreenetContractTrafficEvent {
  if (kindRank(b.slotKind) !== kindRank(a.slotKind)) {
    return kindRank(b.slotKind) > kindRank(a.slotKind) ? b : a;
  }
  if (sourceRank(b.source) !== sourceRank(a.source)) {
    return sourceRank(b.source) > sourceRank(a.source) ? b : a;
  }
  return b.at >= a.at ? b : a;
}

/** Newest first, last N, host+kind win over a log duplicate. */
export function mergeFreenetContractTraffic(
  events: FreenetContractTrafficEvent[],
  nowMs = Date.now(),
  freshMs: number | null = FREENET_CONTRACT_TRAFFIC_FRESH_MS,
): FreenetContractTrafficEvent[] {
  const kept: FreenetContractTrafficEvent[] = [];
  const sorted = [...events].sort((a, b) => b.at - a.at);
  for (const event of sorted) {
    if (freshMs !== null && nowMs - event.at > freshMs) continue;
    const idx = kept.findIndex((row) => sameTraffic(row, event));
    if (idx >= 0) {
      kept[idx] = preferTraffic(kept[idx], event);
      continue;
    }
    kept.push(event);
    if (kept.length >= FREENET_CONTRACT_TRAFFIC_MAX) break;
  }
  return kept;
}

export function visibleFreenetContractTraffic(
  events: FreenetContractTrafficEvent[],
  nowMs = Date.now(),
  fadeMs = FREENET_CONTRACT_TRAFFIC_FADE_MS,
): FreenetContractTrafficEvent[] {
  return events.filter((event) => nowMs - event.at <= fadeMs);
}

export function asFreenetContractTrafficEvent(raw: unknown): FreenetContractTrafficEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<FreenetContractTrafficEvent>;
  if (o.op !== 'put' && o.op !== 'get' && o.op !== 'subscribe') return null;
  if (typeof o.at !== 'number' || !Number.isFinite(o.at)) return null;
  const slotKind = isFreenetContractSlotKind(o.slotKind) ? o.slotKind : 'unknown';
  return createFreenetContractTrafficEvent({
    op: o.op,
    source: o.source === 'host' ? 'host' : 'log',
    slotKind,
    at: o.at,
    id: typeof o.id === 'string' ? o.id : undefined,
    contractKey: typeof o.contractKey === 'string' ? o.contractKey : undefined,
    peerId: typeof o.peerId === 'string' ? o.peerId : undefined,
  });
}

export function asFreenetContractTrafficList(raw: unknown): FreenetContractTrafficEvent[] {
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && typeof (raw as { length?: unknown }).length === 'number'
      ? Array.from(raw as ArrayLike<unknown>)
      : [];
  const events: FreenetContractTrafficEvent[] = [];
  for (const row of rows) {
    const event = asFreenetContractTrafficEvent(row);
    if (event) events.push(event);
  }
  return events;
}
