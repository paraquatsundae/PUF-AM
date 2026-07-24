/**
 * Client helpers for mDNS / LAN sync peer discovery.
 * Browsers cannot browse mDNS themselves — they ask the current Express hub.
 */
import type { PufomSyncPeer } from '../../shared/sync/mdnsConstants';
import { apiUrl, getApiBaseUrl } from './apiBase';

const PEER_BASE_KEY = 'pufom_sync_peer_base';

export type { PufomSyncPeer };

export function getSelectedSyncPeerBase(): string {
  if (typeof sessionStorage === 'undefined') return getApiBaseUrl();
  const stored = sessionStorage.getItem(PEER_BASE_KEY)?.trim().replace(/\/$/, '') || '';
  return stored || getApiBaseUrl();
}

export function setSelectedSyncPeerBase(baseUrl: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  if (!baseUrl) {
    sessionStorage.removeItem(PEER_BASE_KEY);
    return;
  }
  sessionStorage.setItem(PEER_BASE_KEY, baseUrl.replace(/\/$/, ''));
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
}

export async function discoverSyncPeers(waitMs = 2500): Promise<PufomSyncPeer[]> {
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
