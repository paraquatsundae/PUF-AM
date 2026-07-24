/**
 * Advertise + browse PUFOM LAN sync hubs via mDNS (Bonjour).
 * Workshop PCs running `npm run dev` appear as `_pufom-sync._tcp`.
 */
import { hostname as osHostname, networkInterfaces } from 'node:os';
import BonjourModule from 'bonjour-service';
import {
  PUFOM_MDNS_TXT,
  PUFOM_MDNS_TYPE,
  type PufomSyncPeer,
} from '../shared/sync/mdnsConstants.ts';

// CJS default export interop (bonjour-service)
const BonjourCtor =
  (BonjourModule as unknown as { default?: typeof BonjourModule }).default ??
  BonjourModule;

type BonjourInstance = InstanceType<typeof BonjourCtor>;
type MdnsService = {
  name?: string;
  host?: string;
  port?: number;
  addresses?: string[];
  txt?: Record<string, unknown>;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  stop?: () => void;
};

let bonjour: BonjourInstance | null = null;
let published: MdnsService | null = null;
let browser: { stop: () => void; on: (event: string, cb: (...args: unknown[]) => void) => void } | null =
  null;
const discovered = new Map<string, PufomSyncPeer>();
let selfPeer: PufomSyncPeer | null = null;
let started = false;

function lanRank(addr: string): number {
  // Prefer real Wi‑Fi/LAN over Hyper-V / WSL / Docker bridges (often 172.x).
  if (addr.startsWith('192.168.')) return 0;
  if (addr.startsWith('10.')) return 1;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(addr)) return 2;
  return 9;
}

export function listLanIpv4(): string[] {
  const out: string[] = [];
  const ifaces = networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const info of list || []) {
      const family = String(info.family);
      if (family !== 'IPv4' && family !== '4') continue;
      if (info.internal) continue;
      const addr = info.address;
      if (lanRank(addr) < 9) out.push(addr);
    }
  }
  out.sort((a, b) => lanRank(a) - lanRank(b) || a.localeCompare(b));
  return out;
}

function pickIpv4(addresses: string[] | undefined): string | undefined {
  if (!addresses?.length) return undefined;
  const lan = addresses.find(
    (a) =>
      a.startsWith('192.168.') ||
      a.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(a)
  );
  return lan || addresses.find((a) => !a.includes(':'));
}

function serviceToPeer(svc: MdnsService): PufomSyncPeer | null {
  const port = Number(svc.port) || 0;
  if (!port) return null;
  const addresses = (svc.addresses || []).filter((a) => typeof a === 'string') as string[];
  const ip = pickIpv4(addresses);
  if (!ip) return null;
  const name = String(svc.name || 'PUFOM Sync');
  const host = String(svc.host || `${ip}`);
  const txtRaw = (svc.txt || {}) as Record<string, unknown>;
  const txt: Record<string, string> = {};
  for (const [k, v] of Object.entries(txtRaw)) {
    if (v != null) txt[k] = String(v);
  }
  const id = `${name}|${ip}|${port}`;
  return {
    id,
    name,
    host: host.includes('.') ? host : `${host}.local`,
    port,
    addresses: addresses.length ? addresses : [ip],
    baseUrl: `http://${ip}:${port}`,
    txt,
    source: 'mdns',
    seenAt: new Date().toISOString(),
  };
}

function upsertPeer(peer: PufomSyncPeer): void {
  // Skip echoing ourselves (same LAN IP + port)
  if (
    selfPeer &&
    peer.port === selfPeer.port &&
    peer.addresses.some((a) => selfPeer!.addresses.includes(a))
  ) {
    return;
  }
  discovered.set(peer.id, peer);
}

export function getSelfPeer(): PufomSyncPeer | null {
  return selfPeer;
}

export function listPufomPeers(): PufomSyncPeer[] {
  const byBase = new Map<string, PufomSyncPeer>();
  if (selfPeer) byBase.set(selfPeer.baseUrl, selfPeer);
  for (const peer of discovered.values()) {
    const prev = byBase.get(peer.baseUrl);
    if (!prev || prev.source === 'self') {
      if (!prev) byBase.set(peer.baseUrl, peer);
      continue;
    }
    if (peer.seenAt >= prev.seenAt) byBase.set(peer.baseUrl, peer);
  }
  return Array.from(byBase.values()).sort((a, b) => {
    if (a.self && !b.self) return -1;
    if (!a.self && b.self) return 1;
    return a.name.localeCompare(b.name);
  });
}

/** Short browse burst — useful when a client hits /api/sync/peers. */
export function refreshPufomMdnsBrowse(ms = 2500): Promise<PufomSyncPeer[]> {
  return new Promise((resolve) => {
    if (!bonjour) {
      resolve(listPufomPeers());
      return;
    }
    try {
      const b = bonjour.find({ type: PUFOM_MDNS_TYPE, protocol: 'tcp' }, (svc: MdnsService) => {
        const peer = serviceToPeer(svc);
        if (peer) upsertPeer(peer);
      });
      setTimeout(() => {
        try {
          b.stop();
        } catch {
          /* ignore */
        }
        resolve(listPufomPeers());
      }, ms);
    } catch {
      resolve(listPufomPeers());
    }
  });
}

export function startPufomMdns(port: number): void {
  if (started) return;
  if (process.env.PUFOM_MDNS === '0') {
    console.log('[mdns] disabled (PUFOM_MDNS=0)');
    return;
  }

  const lanIps = listLanIpv4();
  const primary = lanIps[0];
  const hostLabel = osHostname().split('.')[0] || 'workshop';
  const displayName = `PUFOM Sync (${hostLabel})`;

  selfPeer = {
    id: `self:${primary || 'local'}:${port}`,
    name: displayName,
    host: `${hostLabel}.local`,
    port,
    addresses: lanIps.length ? lanIps : ['127.0.0.1'],
    baseUrl: `http://${primary || '127.0.0.1'}:${port}`,
    txt: { ...PUFOM_MDNS_TXT },
    self: true,
    source: 'self',
    seenAt: new Date().toISOString(),
  };

  try {
    const mdnsOpts = primary ? ({ interface: primary } as Record<string, string>) : undefined;
    bonjour = new BonjourCtor(mdnsOpts, (err: Error) => {
      console.warn('[mdns] runtime error:', err?.message || err);
    });
  } catch (error) {
    console.warn('[mdns] failed to start Bonjour — peer discovery offline:', error);
    return;
  }

  try {
    published = bonjour.publish({
      name: displayName,
      type: PUFOM_MDNS_TYPE,
      port,
      protocol: 'tcp',
      txt: { ...PUFOM_MDNS_TXT },
      disableIPv6: true,
    }) as MdnsService;
    published.on?.('up', () => {
      console.log(
        `[mdns] advertising "${displayName}" type=_${PUFOM_MDNS_TYPE}._tcp port=${port}` +
          (primary ? ` iface=${primary}` : '')
      );
      console.log(`[mdns] LAN URL: ${selfPeer?.baseUrl}  (.local: http://${hostLabel}.local:${port})`);
    });
    published.on?.('error', (...args: unknown[]) => {
      const err = args[0] as Error | undefined;
      console.warn('[mdns] publish error:', err?.message || err);
    });
  } catch (error) {
    console.warn('[mdns] publish failed:', error);
  }

  try {
    browser = bonjour.find({ type: PUFOM_MDNS_TYPE, protocol: 'tcp' });
    browser.on('up', (...args: unknown[]) => {
      const peer = serviceToPeer(args[0] as MdnsService);
      if (peer) {
        upsertPeer(peer);
        console.log(`[mdns] peer up: ${peer.name} ${peer.baseUrl}`);
      }
    });
    browser.on('down', (...args: unknown[]) => {
      const peer = serviceToPeer(args[0] as MdnsService);
      if (peer) {
        discovered.delete(peer.id);
        console.log(`[mdns] peer down: ${peer.name}`);
      }
    });
  } catch (error) {
    console.warn('[mdns] browse failed:', error);
  }

  started = true;
}

export function stopPufomMdns(): void {
  try {
    browser?.stop();
  } catch {
    /* ignore */
  }
  try {
    published?.stop();
  } catch {
    /* ignore */
  }
  try {
    bonjour?.destroy();
  } catch {
    /* ignore */
  }
  browser = null;
  published = null;
  bonjour = null;
  discovered.clear();
  started = false;
}
