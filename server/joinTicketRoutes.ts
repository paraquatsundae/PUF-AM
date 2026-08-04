/**
 * LAN resolution for short join tickets.
 *
 * Two halves, both on the workshop Express host:
 *
 * - **Owner (A)** publishes Hot + bones to Freenet, then `POST`s the manifest
 *   here keyed by the ticket it read out to the joiner.
 * - **Joiner (B)** asks *its own* hub to `…/resolve` the ticket. The hub checks
 *   its own shelf, then an explicit owner address, then mDNS peers, and fetches
 *   the manifest server-side.
 *
 * The joiner's browser deliberately never talks to the owner's hub directly:
 * `am.pufworks.farm` is HTTPS, and a page on HTTPS cannot fetch
 * `http://192.168.x.x` without being blocked as mixed content. Resolving in
 * Node also keeps CORS out of the picture entirely.
 *
 * Freenet still carries the farm. Nothing here moves farm data — a manifest is
 * two contract URIs plus a role, and the ciphertext they point at only opens
 * with a FarmCode-derived key.
 */
import type { Express, Request, Response } from 'express';

import {
  coerceJoinRole,
  isJoinManifestExpired,
  normalizeJoinTicket,
  parseJoinManifestV2,
  type JoinManifestV2,
} from '../shared/sync/joinTicket.ts';
import {
  clearJoinLookupMisses,
  countJoinManifests,
  deleteJoinManifest,
  getJoinManifest,
  isJoinLookupThrottled,
  putJoinManifest,
  recordJoinLookupMiss,
} from './joinManifestStore.ts';
import { listPufomPeers, refreshPufomMdnsBrowse } from './mdnsHub.ts';

const PEER_FETCH_TIMEOUT_MS = 4000;
const PEER_BROWSE_MS = 2500;

function clientKey(req: Request): string {
  return String(req.ip || req.socket.remoteAddress || 'unknown');
}

function isPrivateHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
  if (hostname.endsWith('.local')) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  return false;
}

/**
 * The joiner supplies this address, so it is untrusted input that this process
 * will then fetch. Confine it to plain HTTP on the local network — a hub has no
 * business being told to go and GET something on the internet.
 */
function normalizeLanBase(raw: unknown): string | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:') return null;
  if (!isPrivateHost(url.hostname)) return null;
  const port = url.port || '3000';
  return `http://${url.hostname}:${port}`;
}

async function fetchManifestFromPeer(
  base: string,
  ticket: string,
): Promise<JoinManifestV2 | null> {
  try {
    const res = await fetch(`${base}/api/sync/join-ticket/${encodeURIComponent(ticket)}`, {
      signal: AbortSignal.timeout(PEER_FETCH_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { manifest?: unknown };
    return parseJoinManifestV2(body.manifest);
  } catch {
    return null;
  }
}

type ResolveOutcome = {
  manifest: JoinManifestV2;
  resolvedFrom: string;
};

async function resolveAcrossLan(
  ticket: string,
  hintBase: string | null,
): Promise<ResolveOutcome | null> {
  const local = getJoinManifest(ticket);
  if (local && !isJoinManifestExpired(local.manifest)) {
    return { manifest: local.manifest, resolvedFrom: 'self' };
  }

  const bases: string[] = [];
  if (hintBase) bases.push(hintBase);

  // A hub that never started mDNS (the Electron shell binds loopback only) just
  // returns nothing here, which is why the owner-address hint exists.
  let peers = listPufomPeers();
  try {
    peers = await refreshPufomMdnsBrowse(PEER_BROWSE_MS);
  } catch {
    /* keep whatever was already discovered */
  }
  for (const peer of peers) {
    if (peer.self) continue;
    bases.push(peer.baseUrl);
  }

  const seen = new Set<string>();
  for (const base of bases) {
    const normalized = base.replace(/\/$/, '');
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    const manifest = await fetchManifestFromPeer(normalized, ticket);
    if (manifest && !isJoinManifestExpired(manifest)) {
      return { manifest, resolvedFrom: normalized };
    }
  }

  return null;
}

export function registerJoinTicketRoutes(app: Express): void {
  /**
   * Owner registers a ticket → manifest. No farm membership check: mist farms
   * have no Firebase identity to check against, and the ticket is the
   * capability. Restricted to callers on this machine or this LAN so a hub bound
   * to `0.0.0.0` cannot be filled from elsewhere.
   */
  app.post('/api/sync/join-ticket', (req: Request, res: Response) => {
    if (!isPrivateHost(String(req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/, ''))) {
      return res.status(403).json({ error: 'Join tickets may only be registered from this LAN' });
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const ticket = normalizeJoinTicket(String(body.ticket ?? ''));
    if (!ticket) {
      return res.status(400).json({ error: 'ticket must look like PUF-XXXX-XXXX' });
    }

    const manifest = parseJoinManifestV2({ ...body, ticket, role: coerceJoinRole(body.role) });
    if (!manifest) {
      return res
        .status(400)
        .json({ error: 'Expected { v: 2, farmId, hotUri, bonesUri, role, ticket }' });
    }
    if (isJoinManifestExpired(manifest)) {
      return res.status(400).json({ error: 'expires is already in the past' });
    }

    const entry = putJoinManifest(manifest, clientKey(req));
    return res.json({
      ok: true,
      ticket: manifest.ticket,
      role: manifest.role,
      expires: manifest.expires,
      registeredAt: entry.registeredAt,
      manifests: countJoinManifests(),
    });
  });

  /** Peer-facing lookup — this hub's own shelf only, no fan-out (avoids loops). */
  app.get('/api/sync/join-ticket/:ticket', (req: Request, res: Response) => {
    const key = clientKey(req);
    if (isJoinLookupThrottled(key)) {
      return res.status(429).json({ error: 'Too many join ticket lookups — wait a few minutes' });
    }

    const ticket = normalizeJoinTicket(String(req.params.ticket || ''));
    if (!ticket) {
      recordJoinLookupMiss(key);
      return res.status(400).json({ error: 'ticket must look like PUF-XXXX-XXXX' });
    }

    const entry = getJoinManifest(ticket);
    if (!entry || isJoinManifestExpired(entry.manifest)) {
      recordJoinLookupMiss(key);
      return res.status(404).json({ error: 'No join manifest for that ticket on this hub' });
    }

    clearJoinLookupMisses(key);
    return res.json({ manifest: entry.manifest, registeredAt: entry.registeredAt });
  });

  /**
   * Joiner-facing resolve — own shelf, then the owner address the joiner typed,
   * then mDNS peers.
   */
  app.get('/api/sync/join-ticket/:ticket/resolve', async (req: Request, res: Response) => {
    const key = clientKey(req);
    if (isJoinLookupThrottled(key)) {
      return res.status(429).json({ error: 'Too many join ticket lookups — wait a few minutes' });
    }

    const ticket = normalizeJoinTicket(String(req.params.ticket || ''));
    if (!ticket) {
      recordJoinLookupMiss(key);
      return res.status(400).json({ error: 'ticket must look like PUF-XXXX-XXXX' });
    }

    const rawBase = req.query.base;
    const hintBase = rawBase ? normalizeLanBase(rawBase) : null;
    if (rawBase && !hintBase) {
      return res.status(400).json({
        error: 'Owner address must be a plain http address on this LAN, e.g. 192.168.1.20:3000',
      });
    }

    try {
      const outcome = await resolveAcrossLan(ticket, hintBase);
      if (!outcome) {
        recordJoinLookupMiss(key);
        return res.status(404).json({
          error:
            'No hub on this Wi‑Fi knows that join ticket. Join on the same Wi‑Fi as the farm owner for now; Freenet-only short tickets are coming later.',
          ticket,
        });
      }

      const expectedFarmId = String(req.query.farmId || '').trim();
      if (expectedFarmId && outcome.manifest.farmId !== expectedFarmId) {
        return res.status(409).json({
          error:
            'That join ticket belongs to a different farm than the FarmCode you recovered with.',
          ticket,
        });
      }

      clearJoinLookupMisses(key);
      return res.json({ manifest: outcome.manifest, resolvedFrom: outcome.resolvedFrom });
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Join ticket resolve failed',
      });
    }
  });

  /** Owner revokes a ticket (new send, wrong person, lost phone). */
  app.delete('/api/sync/join-ticket/:ticket', (req: Request, res: Response) => {
    if (!isPrivateHost(String(req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/, ''))) {
      return res.status(403).json({ error: 'Join tickets may only be revoked from this LAN' });
    }
    const removed = deleteJoinManifest(String(req.params.ticket || ''));
    return res.json({ ok: true, revoked: removed, manifests: countJoinManifests() });
  });
}
