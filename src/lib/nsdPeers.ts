/**
 * Native Android NSD browse for `_pufom-sync._tcp` (Capacitor local plugin).
 * Web / iOS: returns [] — callers fall back to hub-mediated mDNS scan.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { PUFOM_MDNS_TYPE, type PufomSyncPeer } from '../../shared/sync/mdnsConstants';

async function probeHub(baseUrl: string): Promise<boolean> {
  try {
    const url = `${baseUrl.replace(/\/$/, '')}/api/health`;
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

type NsdService = {
  name: string;
  host: string;
  port: number;
  addresses: string[];
};

type PufomNsdPlugin = {
  discover(options: {
    serviceType: string;
    timeoutMs?: number;
  }): Promise<{ services: NsdService[] }>;
};

const PufomNsd = registerPlugin<PufomNsdPlugin>('PufomNsd');

export function nsdBrowseAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

function pickIpv4(addresses: string[]): string | undefined {
  const lan = addresses.find(
    (a) =>
      a.startsWith('192.168.') ||
      a.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(a)
  );
  return lan || addresses.find((a) => a && !a.includes(':'));
}

export async function discoverNsdPeers(timeoutMs = 3500): Promise<PufomSyncPeer[]> {
  if (!nsdBrowseAvailable()) return [];

  const serviceType = `_${PUFOM_MDNS_TYPE}._tcp.`;
  let services: NsdService[] = [];
  try {
    const result = await PufomNsd.discover({ serviceType, timeoutMs });
    services = result.services || [];
  } catch (err) {
    console.warn('[nsdPeers] native discover failed', err);
    return [];
  }

  const peers: PufomSyncPeer[] = [];
  const seen = new Set<string>();
  for (const svc of services) {
    const port = Number(svc.port) || 0;
    if (!port) continue;
    const ip = pickIpv4(svc.addresses || []) || (svc.host && !svc.host.includes(':') ? svc.host : '');
    if (!ip) continue;
    const baseUrl = `http://${ip}:${port}`;
    if (seen.has(baseUrl)) continue;
    seen.add(baseUrl);
    peers.push({
      id: `nsd:${baseUrl}`,
      name: svc.name || 'PUFOM Sync',
      host: svc.host || ip,
      port,
      addresses: svc.addresses?.length ? svc.addresses : [ip],
      baseUrl,
      source: 'nsd',
      seenAt: new Date().toISOString(),
    });
  }

  // Drop unreachable hubs (stale NSD ghosts)
  const live: PufomSyncPeer[] = [];
  await Promise.all(
    peers.map(async (p) => {
      if (await probeHub(p.baseUrl)) live.push(p);
    })
  );
  return live;
}
