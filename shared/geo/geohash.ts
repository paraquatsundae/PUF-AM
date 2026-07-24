/**
 * Minimal geohash encode + neighbors for nearby-farm discovery.
 * Precision 5 ≈ 4.9 km × 4.9 km cells; 6 ≈ 1.2 km.
 */

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function encodeGeohash(lat: number, lng: number, precision = 5): string {
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let geohash = '';

  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        idx = (idx << 1) + 1;
        lngMin = mid;
      } else {
        idx = idx << 1;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        idx = (idx << 1) + 1;
        latMin = mid;
      } else {
        idx = idx << 1;
        latMax = mid;
      }
    }
    evenBit = !evenBit;
    if (++bit === 5) {
      geohash += BASE32.charAt(idx);
      bit = 0;
      idx = 0;
    }
  }
  return geohash;
}

function adjacent(geohash: string, dir: 'n' | 's' | 'e' | 'w'): string {
  const neighbor: Record<string, [string, string]> = {
    n: ['p0r21436x8zb9dcf5h7kjnmqesgutwvy', 'bc01fg45238967deuvhjyznpkmstqrwx'],
    s: ['14365h7k9dcfesgujnmqp0r2twvyx8zb', '238967debc01fg45kmstqrwxuvhjyznp'],
    e: ['bc01fg45238967deuvhjyznpkmstqrwx', 'p0r21436x8zb9dcf5h7kjnmqesgutwvy'],
    w: ['238967debc01fg45kmstqrwxuvhjyznp', '14365h7k9dcfesgujnmqp0r2twvyx8zb'],
  };
  const border: Record<string, [string, string]> = {
    n: ['prxz', 'bcfguvyz'],
    s: ['028b', '0145hjnp'],
    e: ['bcfguvyz', 'prxz'],
    w: ['0145hjnp', '028b'],
  };

  const lastCh = geohash.slice(-1);
  let parent = geohash.slice(0, -1);
  const type = geohash.length % 2;

  if (border[dir][type].includes(lastCh) && parent) {
    parent = adjacent(parent, dir);
  }

  return parent + BASE32.charAt(neighbor[dir][type].indexOf(lastCh));
}

/** Cell + 8 neighbors (for prefix queries). */
export function geohashNeighbors(geohash: string): string[] {
  const n = adjacent(geohash, 'n');
  const s = adjacent(geohash, 's');
  const e = adjacent(geohash, 'e');
  const w = adjacent(geohash, 'w');
  return [
    geohash,
    n,
    s,
    e,
    w,
    adjacent(n, 'e'),
    adjacent(n, 'w'),
    adjacent(s, 'e'),
    adjacent(s, 'w'),
  ];
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export type FarmPublicDiscovery = {
  farmId: string;
  name: string;
  lat: number;
  lng: number;
  geohash: string;
  showNearby: boolean;
  updatedAt: string;
};

export function parseGeoInput(body: unknown): { lat: number; lng: number } | null {
  if (!body || typeof body !== 'object') return null;
  const lat = Number((body as { lat?: unknown }).lat);
  const lng = Number((body as { lng?: unknown }).lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
