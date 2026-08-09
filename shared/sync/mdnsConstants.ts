/** mDNS / Bonjour type for PUFOM LAN sync hubs (→ `_pufom-sync._tcp`). */
export const PUFOM_MDNS_TYPE = 'pufom-sync';

export const PUFOM_MDNS_TXT = {
  ver: '1',
  path: '/api/sync/lan',
  proto: 'http',
} as const;

/**
 * Optional TXT keys layered on top of the base record.
 *
 * TXT is the only part of an advertisement that survives a failed `.local`
 * lookup, which is why the hub's own view of its address goes there — and why the
 * two facts a tablet needs *before* it can call anything (which kind of hub this
 * is, and whether it will demand a pairing code) go there too, rather than
 * costing an extra probe per candidate.
 */
export const PUFOM_MDNS_TXT_KEYS = {
  /** Hub's own view of its LAN IPv4 address. */
  ip: 'ip',
  /** `HubKind` — `desktop-lan` or `workshop-dev`. */
  kind: 'kind',
  /** `1` when the hub needs a pairing code before it serves `/api/*`. */
  pair: 'pair',
} as const;

export type PufomSyncPeer = {
  id: string;
  name: string;
  host: string;
  port: number;
  addresses: string[];
  baseUrl: string;
  txt?: Record<string, string>;
  self?: boolean;
  source: 'mdns' | 'self' | 'nsd';
  seenAt: string;
};
