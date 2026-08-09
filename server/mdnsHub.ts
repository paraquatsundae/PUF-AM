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

/**
 * Which *interface* a candidate address is on, which decides more than its class
 * does.
 *
 * The trap this exists for: with USB tethering up, the tethered interface hands
 * out `192.168.42.x` — a textbook private LAN address that outranked the real
 * Wi‑Fi one under address-class ordering alone. The hub then advertised, and
 * printed, an address reachable only from the phone plugged into it. Docker,
 * libvirt and WSL bridges have the same shape.
 *
 * Address class still breaks ties, so a laptop with one Wi‑Fi interface behaves
 * exactly as before.
 */
export function interfaceRank(name: string): number {
  const n = name.toLowerCase();
  // Linux `wlan0` / `wlp3s0`, macOS `en0` is ambiguous so it lands in "wired".
  if (/^(wl|wifi|wi-fi|wlan)/.test(n)) return 0;
  if (/^(eth|en|eno|ens|enp|em\d)/.test(n) && !/u\d/.test(n)) return 1;
  // Virtual bridges: docker0, br-*, virbr0, vmnet1, veth*, tun0, tap0, wg0, zt*.
  if (/^(docker|br-|bridge|virbr|vmnet|vboxnet|veth|tun|tap|wg|zt|utun|tailscale)/.test(n)) {
    return 7;
  }
  // USB tether / RNDIS / CDC-NCM, plus the `enp0s20u2` shape a USB NIC gets.
  if (/^(usb|rndis|ncm)/.test(n) || /u\d/.test(n)) return 8;
  return 5;
}

export function listLanIpv4(): string[] {
  const out: { addr: string; iface: number }[] = [];
  const ifaces = networkInterfaces();
  for (const [name, list] of Object.entries(ifaces)) {
    for (const info of list || []) {
      const family = String(info.family);
      if (family !== 'IPv4' && family !== '4') continue;
      if (info.internal) continue;
      const addr = info.address;
      if (lanRank(addr) < 9) out.push({ addr, iface: interfaceRank(name) });
    }
  }
  out.sort(
    (a, b) =>
      a.iface - b.iface || lanRank(a.addr) - lanRank(b.addr) || a.addr.localeCompare(b.addr),
  );
  return out.map((entry) => entry.addr);
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
      const b = bonjour.find({ type: PUFOM_MDNS_TYPE, protocol: 'tcp' }, (svc) => {
        const peer = serviceToPeer(svc as unknown as MdnsService);
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

export type PufomMdnsOptions = {
  /** Service instance name. Defaults to `PUFOM Sync (<host>)`. */
  name?: string;
  /** Merged into the advertised TXT record — `kind`, `pair`, and friends. */
  txt?: Record<string, string>;
};

/**
 * @param port The port the *advertised* API is listening on. For the Electron
 *   shell that is the LAN listener's port, never the loopback one — advertising
 *   an ephemeral loopback port publishes an address nothing on the LAN can reach,
 *   which is exactly why this stayed deferred until there was a LAN listener.
 */
export function startPufomMdns(port: number, options?: PufomMdnsOptions): void {
  if (started) return;
  if (process.env.PUFOM_MDNS === '0') {
    console.log('[mdns] disabled (PUFOM_MDNS=0)');
    return;
  }

  const lanIps = listLanIpv4();
  const primary = lanIps[0];
  const hostLabel = osHostname().split('.')[0] || 'workshop';
  const displayName = options?.name ?? `PUFOM Sync (${hostLabel})`;
  const extraTxt = options?.txt ?? {};

  selfPeer = {
    id: `self:${primary || 'local'}:${port}`,
    name: displayName,
    host: `${hostLabel}.local`,
    port,
    addresses: lanIps.length ? lanIps : ['127.0.0.1'],
    baseUrl: `http://${primary || '127.0.0.1'}:${port}`,
    txt: { ...PUFOM_MDNS_TXT, ...extraTxt },
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
      // `bonjour-service` otherwise targets the SRV at a bare `os.hostname()` —
      // `cdgeo`, a single label with no `.local`. Desktop resolvers cope; Android
      // does not. Its NSD reports SERVICE_RESOLVED and then hangs in getaddrinfo
      // on a name it will never ask about over multicast, so the tablet's scan
      // comes back empty having just seen the hub.
      //
      // The prefix matters as much as the suffix: on a Linux box avahi-daemon
      // already owns `<hostname>.local`, and publishing a second A record for it
      // from this process is a conflict that costs us the name altogether. This
      // one is ours. Plan: `Plans/APK_FREENET_PLUGIN.md`.
      host: `pufom-${hostLabel}.local`,
      // The address, in the payload that survives a failed host lookup — a
      // client that cannot resolve the name can still reach the hub.
      txt: { ...PUFOM_MDNS_TXT, ...extraTxt, ...(primary ? { ip: primary } : {}) },
      disableIPv6: true,
    }) as unknown as MdnsService;
    published.on?.('up', () => {
      console.log(
        `[mdns] advertising "${displayName}" type=_${PUFOM_MDNS_TYPE}._tcp port=${port}` +
          (primary ? ` iface=${primary}` : '')
      );
      console.log(
        `[mdns] LAN URL: ${selfPeer?.baseUrl}  (.local: http://pufom-${hostLabel}.local:${port})`,
      );
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
