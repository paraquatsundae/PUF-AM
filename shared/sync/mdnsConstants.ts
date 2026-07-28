/** mDNS / Bonjour type for PUFOM LAN sync hubs (→ `_pufom-sync._tcp`). */
export const PUFOM_MDNS_TYPE = 'pufom-sync';

export const PUFOM_MDNS_TXT = {
  ver: '1',
  path: '/api/sync/lan',
  proto: 'http',
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
