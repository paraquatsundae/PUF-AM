/**
 * Parse a Freenet 0.2 JSON node-status body — never HTML.
 *
 * 0.2.135 serves an HTML dashboard at `GET /` and `GET /v1/version` as
 * `{ version }`. There is no documented `GET /status` on that pin. If a later
 * node adds one, we accept a small set of field names and ignore the rest.
 * Do not scrape the dashboard HTML.
 */

import type { FreenetNodeRingInfo, FreenetRingPeer } from './types.ts';

const EMPTY_RING: FreenetNodeRingInfo = {
  peers: [],
  peerCount: 0,
  peerSource: 'none',
};

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** True when a body is HTML (dashboard) rather than JSON. */
export function looksLikeHtmlStatusBody(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith('<') || /<html[\s>]/i.test(trimmed.slice(0, 200));
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Ring coordinate in [0, 1). Reject values outside that — do not wrap junk. */
export function asRingLocation(value: unknown): number | undefined {
  const n = asFiniteNumber(value);
  if (n === undefined) return undefined;
  if (n < 0 || n >= 1) return undefined;
  return n;
}

function peerFromUnknown(raw: unknown, index: number): FreenetRingPeer | null {
  if (typeof raw === 'string' && raw.trim()) return { id: raw.trim() };
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const location = asRingLocation(raw);
    return location === undefined ? { id: String(index) } : { location };
  }
  if (!isJsonObject(raw)) return null;
  const idRaw = raw.id ?? raw.peerId ?? raw.peer_id ?? raw.address ?? raw.addr;
  const id = typeof idRaw === 'string' && idRaw.trim() ? idRaw.trim() : undefined;
  const location = asRingLocation(raw.location ?? raw.loc ?? raw.ringLocation);
  if (!id && location === undefined) return null;
  return { ...(id ? { id } : {}), ...(location !== undefined ? { location } : {}) };
}

function peersFromUnknown(raw: unknown): FreenetRingPeer[] {
  if (!Array.isArray(raw)) return [];
  const out: FreenetRingPeer[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const peer = peerFromUnknown(raw[i], i);
    if (peer) out.push(peer);
  }
  return out;
}

/**
 * Turn a parsed JSON value into a ring snapshot, or `null` when it is not an object.
 * An empty object is a valid "no peers" answer.
 */
export function parseFreenetNodeStatusJson(raw: unknown): FreenetNodeRingInfo | null {
  if (!isJsonObject(raw)) return null;

  const location = asRingLocation(
    raw.location ?? raw.ownLocation ?? raw.own_location ?? raw.ringLocation,
  );
  const peers = peersFromUnknown(
    raw.peers ?? raw.connectedPeers ?? raw.connected_peers ?? raw.peerList,
  );
  const counted = asFiniteNumber(
    raw.peerCount ?? raw.peer_count ?? raw.connectedPeerCount ?? raw.connections,
  );
  const nodeVersion =
    typeof raw.version === 'string' && raw.version.trim()
      ? raw.version.trim()
      : typeof raw.nodeVersion === 'string' && raw.nodeVersion.trim()
        ? raw.nodeVersion.trim()
        : undefined;

  const peerCount = peers.length > 0 ? peers.length : Math.max(0, Math.floor(counted ?? 0));
  const hasLocations =
    location !== undefined || peers.some((p) => p.location !== undefined);
  const hasIds = peers.some((p) => Boolean(p.id));

  let peerSource: FreenetNodeRingInfo['peerSource'] = 'none';
  if (hasLocations) peerSource = 'locations';
  else if (hasIds) peerSource = 'ids';
  else if (peerCount > 0) peerSource = 'count';

  return {
    ...(location !== undefined ? { location } : {}),
    peers,
    peerCount,
    peerSource,
    ...(nodeVersion ? { nodeVersion } : {}),
  };
}

export function emptyFreenetNodeRing(over: Partial<FreenetNodeRingInfo> = {}): FreenetNodeRingInfo {
  return { ...EMPTY_RING, ...over, peers: over.peers ?? [] };
}

/**
 * Merge `/v1/version` `{ version }` onto a ring snapshot without inventing peers.
 */
export function mergeNodeVersion(
  ring: FreenetNodeRingInfo | undefined,
  versionRaw: unknown,
): FreenetNodeRingInfo | undefined {
  const version =
    isJsonObject(versionRaw) && typeof versionRaw.version === 'string'
      ? versionRaw.version.trim()
      : undefined;
  if (!version) return ring;
  if (!ring) return emptyFreenetNodeRing({ nodeVersion: version, peerSource: 'unreported' });
  return { ...ring, nodeVersion: ring.nodeVersion || version };
}

/** Version string from `GET /v1/version` `{ version }`. */
export function freenet02VersionString(raw: unknown): string | undefined {
  if (!isJsonObject(raw) || typeof raw.version !== 'string') return undefined;
  const version = raw.version.trim();
  return version || undefined;
}

/**
 * True when a `/v1/version` body is Freenet 0.2 (not a leftover HTML dashboard
 * or some other `{ version }` JSON).
 */
export function looksLikeFreenet02Version(raw: unknown): boolean {
  const version = freenet02VersionString(raw);
  if (!version) return false;
  if (version.startsWith('0.2')) return true;
  return /freenet/i.test(version) && /0\.2\.\d+/.test(version);
}

export function looksLikeFreenet02VersionText(text: string): boolean {
  if (!text || looksLikeHtmlStatusBody(text)) return false;
  try {
    return looksLikeFreenet02Version(JSON.parse(text) as unknown);
  } catch {
    return false;
  }
}
