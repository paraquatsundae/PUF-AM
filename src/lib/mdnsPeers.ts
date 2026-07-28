/**
 * Client helpers for mDNS / LAN sync peer discovery.
 * Browsers ask the Express hub; Capacitor Android uses native NSD first.
 */
import type { PufomSyncPeer } from '../../shared/sync/mdnsConstants';
import { apiUrl, getApiBaseUrl, setRuntimeApiBaseUrl } from './apiBase';
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
  const stored = sessionStorage.getItem(PEER_BASE_KEY)?.trim().replace(/\/$/, '') || '';
  if (stored) return stored;
  if (typeof localStorage !== 'undefined') {
    const last = localStorage.getItem(LAST_HUB_KEY)?.trim().replace(/\/$/, '') || '';
    if (last) return last;
  }
  return getApiBaseUrl();
}

export function setSelectedSyncPeerBase(baseUrl: string | null): void {
  if (typeof sessionStorage !== 'undefined') {
    if (!baseUrl) {
      sessionStorage.removeItem(PEER_BASE_KEY);
    } else {
      sessionStorage.setItem(PEER_BASE_KEY, baseUrl.replace(/\/$/, ''));
    }
  }
  if (baseUrl && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(LAST_HUB_KEY, baseUrl.replace(/\/$/, ''));
    } catch {
      /* ignore */
    }
  }
  // Packaged APK: also steer /api/* at the discovered hub for the session.
  if (baseUrl) {
    setRuntimeApiBaseUrl(baseUrl);
  }
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
    const res = await fetch(apiUrl('/api/sync/self'));
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
  const qs = new URLSearchParams({ waitMs: String(waitMs) });
  const res = await fetch(apiUrl(`/api/sync/peers?${qs}`));
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
