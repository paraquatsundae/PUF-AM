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
  /** Service TXT record. `ip` is the hub's own view of its LAN address. */
  txt?: Record<string, string>;
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

    // A hub with more than one interface up — Wi‑Fi plus USB tethering is the
    // common one — resolves to whichever address Android's getaddrinfo returned,
    // and that is regularly the one on a network this tablet is not on. The hub
    // publishes the address it wants to be reached on in TXT; try every
    // candidate rather than trusting the first.
    const advertised = svc.txt?.ip?.trim();
    const candidates = [
      ...(advertised ? [advertised] : []),
      ...(svc.addresses || []),
      ...(svc.host && !svc.host.includes(':') ? [svc.host] : []),
    ];
    const ordered = [...new Set(candidates.filter(Boolean))];
    const ip = pickIpv4(ordered) || ordered[0];
    if (!ip) continue;

    const baseUrl = `http://${ip}:${port}`;
    if (seen.has(baseUrl)) continue;
    seen.add(baseUrl);
    peers.push({
      id: `nsd:${baseUrl}`,
      name: svc.name || 'PUFOM Sync',
      host: svc.host || ip,
      port,
      addresses: ordered.length ? ordered : [ip],
      baseUrl,
      ...(svc.txt ? { txt: svc.txt } : {}),
      source: 'nsd',
      seenAt: new Date().toISOString(),
    });
  }

  // Drop unreachable hubs (stale NSD ghosts), and fall back through the other
  // addresses a hub gave us before writing it off.
  const live: PufomSyncPeer[] = [];
  await Promise.all(
    peers.map(async (p) => {
      for (const candidate of p.addresses) {
        const baseUrl = `http://${candidate}:${p.port}`;
        if (await probeHub(baseUrl)) {
          live.push({ ...p, baseUrl, id: `nsd:${baseUrl}` });
          return;
        }
      }
    })
  );
  return live;
}
