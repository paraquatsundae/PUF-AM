/**
 * Client helpers for mDNS / LAN sync peer discovery.
 * Browsers ask the Express hub; Capacitor Android uses native NSD first.
 */
import type { PufomSyncPeer } from '../../shared/sync/mdnsConstants';
import {
  apiFetch,
  apiHubMissing,
  apiUrl,
  getApiBaseUrl,
  NO_API_HUB_MESSAGE,
  normalizeHubBase,
  setRuntimeApiBaseUrl,
} from './apiBase';
import { discoverNsdPeers, nsdBrowseAvailable } from './nsdPeers';

const PEER_BASE_KEY = 'pufom_sync_peer_base';
const LAST_HUB_KEY = 'pufom_last_sync_hub';

export type { PufomSyncPeer };

export type DiscoverPeersResult = {
  peers: PufomSyncPeer[];
  source: 'nsd' | 'hub' | 'mixed' | 'none';
};

export function getSelectedSyncPeerBase(): string {
  if (typeof sessionStorage === 'undefined') return getApiBaseUrl();
  const stored = normalizeHubBase(sessionStorage.getItem(PEER_BASE_KEY) || '');
  if (stored) return stored;
  if (typeof localStorage !== 'undefined') {
    const last = normalizeHubBase(localStorage.getItem(LAST_HUB_KEY) || '');
    if (last) return last;
  }
  return getApiBaseUrl();
}

/**
 * Remember a hub for this session and the next cold start.
 *
 * Normalised before it is written, so an address that is not a URL never reaches
 * storage — once there it survives reinstalls and every later `fetch()` fails
 * with a bare `TypeError` that reads as "no signal" rather than "bad address".
 */
export function setSelectedSyncPeerBase(baseUrl: string | null): void {
  const base = baseUrl ? normalizeHubBase(baseUrl) : '';

  if (typeof sessionStorage !== 'undefined') {
    if (!base) {
      sessionStorage.removeItem(PEER_BASE_KEY);
    } else {
      sessionStorage.setItem(PEER_BASE_KEY, base);
    }
  }
  if (base && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(LAST_HUB_KEY, base);
    } catch {
      /* ignore */
    }
  }
  // Packaged APK: also steer /api/* at the discovered hub for the session.
  setRuntimeApiBaseUrl(base || null);
}

/** Build an absolute API URL against the selected sync peer (or default API base). */
export function syncApiUrl(path: string): string {
  const base = getSelectedSyncPeerBase();
  const p = path.startsWith('/') ? path : `/${path}`;
  if (!base) return apiUrl(p);
  return `${base}${p}`;
}

export async function fetchSyncSelf(): Promise<{
  self: PufomSyncPeer | null;
  lanIpv4: string[];
  mdnsEnabled: boolean;
}> {
  try {
    const res = await apiFetch(apiUrl('/api/sync/self'), { timeoutMs: 4000 });
    if (!res.ok) {
      return { self: null, lanIpv4: [], mdnsEnabled: false };
    }
    const data = (await res.json()) as {
      self?: PufomSyncPeer | null;
      lanIpv4?: string[];
      mdnsEnabled?: boolean;
    };
    return {
      self: data.self || null,
      lanIpv4: data.lanIpv4 || [],
      mdnsEnabled: Boolean(data.mdnsEnabled),
    };
  } catch {
    return { self: null, lanIpv4: [], mdnsEnabled: false };
  }
}

async function discoverViaHub(waitMs: number): Promise<PufomSyncPeer[]> {
  // A packaged APK with no hub would fetch `https://localhost/api/sync/peers`,
  // which the WebView answers from the bundled assets — a 200 full of HTML that
  // parses to nothing and looks like "no peers found" instead of "not connected".
  if (apiHubMissing()) throw new Error(NO_API_HUB_MESSAGE);

  const qs = new URLSearchParams({ waitMs: String(waitMs) });
  const res = await apiFetch(apiUrl(`/api/sync/peers?${qs}`), { timeoutMs: waitMs + 5000 });
  const data = (await res.json().catch(() => ({}))) as {
    peers?: PufomSyncPeer[];
    error?: string;
  };
  if (!res.ok && !data.peers) {
    throw new Error(data.error || `Peer scan failed (${res.status})`);
  }
  return data.peers || [];
}

/**
 * Prefer native NSD on Android (cold-start). Fall back to hub-mediated browse.
 */
export async function discoverSyncPeersDetailed(
  waitMs = 2500
): Promise<DiscoverPeersResult> {
  const byUrl = new Map<string, PufomSyncPeer>();

  if (nsdBrowseAvailable()) {
    try {
      const native = await discoverNsdPeers(Math.max(waitMs, 3200));
      for (const p of native) byUrl.set(p.baseUrl, p);
      if (byUrl.size > 0) {
        // Also try hub if we already have a base (merge extra peers)
        try {
          const hub = await discoverViaHub(Math.min(waitMs, 1500));
          for (const p of hub) {
            if (!byUrl.has(p.baseUrl)) byUrl.set(p.baseUrl, p);
          }
          return {
            peers: Array.from(byUrl.values()),
            source: hub.length ? 'mixed' : 'nsd',
          };
        } catch {
          return { peers: Array.from(byUrl.values()), source: 'nsd' };
        }
      }
    } catch (err) {
      console.warn('[mdnsPeers] NSD path failed', err);
    }
  }

  try {
    const hub = await discoverViaHub(waitMs);
    return { peers: hub, source: hub.length ? 'hub' : 'none' };
  } catch (err) {
    if (byUrl.size) return { peers: Array.from(byUrl.values()), source: 'nsd' };
    throw err;
  }
}

export async function discoverSyncPeers(waitMs = 2500): Promise<PufomSyncPeer[]> {
  const { peers } = await discoverSyncPeersDetailed(waitMs);
  return peers;
}

/** Probe that a peer hub is reachable (health). */
export async function probeSyncPeer(baseUrl: string): Promise<boolean> {
  try {
    const url = `${baseUrl.replace(/\/$/, '')}/api/health`;
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}
