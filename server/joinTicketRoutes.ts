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
import { readJoinGrant } from '../shared/sync/joinGrant.ts';
import type { JoinTicketLedgerRow } from '../shared/sync/joinLedger.ts';
import {
  clearJoinLookupMisses,
  countJoinManifests,
  deleteJoinManifest,
  deleteJoinManifestById,
  getJoinManifest,
  isJoinLookupThrottled,
  joinManifestStoreLocation,
  listJoinManifests,
  markJoinManifestRedeemed,
  putJoinManifest,
  recordJoinLookupMiss,
  type JoinManifestEntry,
} from './joinManifestStore.ts';
import { listLanIpv4, listPufomPeers, refreshPufomMdnsBrowse } from './mdnsHub.ts';

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

/**
 * "Nothing came back" is three different problems for the operator — the hub was
 * not there, the hub was there and had never heard of the ticket, or the hub
 * answered something unusable — and only the first is fixed by checking the
 * network. Keep them apart all the way out to the message.
 */
type PeerLookup =
  | { status: 'found'; manifest: JoinManifestV2 }
  | { status: 'no-ticket' }
  | { status: 'unreachable' };

async function fetchManifestFromPeer(base: string, ticket: string): Promise<PeerLookup> {
  // `Response` in this module is Express's, not the fetch one.
  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await fetch(`${base}/api/sync/join-ticket/${encodeURIComponent(ticket)}`, {
      signal: AbortSignal.timeout(PEER_FETCH_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });
  } catch {
    return { status: 'unreachable' };
  }

  if (!res.ok) return { status: 'no-ticket' };
  try {
    const body = (await res.json()) as { manifest?: unknown };
    const manifest = parseJoinManifestV2(body.manifest);
    if (!manifest || isJoinManifestExpired(manifest)) return { status: 'no-ticket' };
    return { status: 'found', manifest };
  } catch {
    return { status: 'no-ticket' };
  }
}

type ResolveOutcome = {
  manifest: JoinManifestV2;
  resolvedFrom: string;
};

type ResolveMiss = {
  /** Hubs that answered and did not have it. */
  asked: string[];
  /** Hubs we were told about but could not reach. */
  unreachable: string[];
};

async function resolveAcrossLan(
  ticket: string,
  hintBase: string | null,
): Promise<ResolveOutcome | ResolveMiss> {
  const local = getJoinManifest(ticket);
  if (local && !isJoinManifestExpired(local.manifest)) {
    // Owner and joiner on one laptop — the bench case, and the only one where
    // this hub is also the shelf holder, so it is the only place the stamp can
    // be written from here. A joiner on another device stamps the owner's hub
    // through the peer-facing lookup below.
    markJoinManifestRedeemed(ticket);
    return { manifest: local.manifest, resolvedFrom: 'self' };
  }

  const bases: string[] = [];
  if (hintBase) bases.push(hintBase);

  // A hub that never started mDNS (the Electron shell binds loopback only) just
  // returns nothing here, which is why the owner-address hint exists — and why
  // the shelf is shared per-machine rather than per-process.
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

  const asked: string[] = [];
  const unreachable: string[] = [];
  const seen = new Set<string>();
  for (const base of bases) {
    const normalized = base.replace(/\/$/, '');
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    const lookup = await fetchManifestFromPeer(normalized, ticket);
    if (lookup.status === 'found') {
      return { manifest: lookup.manifest, resolvedFrom: normalized };
    }
    (lookup.status === 'unreachable' ? unreachable : asked).push(normalized);
  }

  return { asked, unreachable };
}

/** This hub's own LAN address, for a message that says which hub actually answered. */
function selfHubLabel(port: string | number): string {
  const [ip] = listLanIpv4();
  return ip ? `${ip}:${port}` : `this laptop:${port}`;
}

/**
 * The sentence the operator reads when a ticket resolves nowhere.
 *
 * The old one asserted they were on the wrong Wi‑Fi, which was the least likely
 * cause and impossible to act on when it was wrong — the shelf being on another
 * process, or the farm never having been sent, look identical from the tablet.
 * Name the hub that answered and what it actually tried.
 */
function describeResolveMiss(ticket: string, miss: ResolveMiss, self: string): string {
  const parts = [`Hub ${self} has no join ticket ${ticket} on its shelf`];

  if (miss.asked.length) {
    parts.push(`and neither did ${miss.asked.join(', ')}`);
  }
  if (miss.unreachable.length) {
    parts.push(`(could not reach ${miss.unreachable.join(', ')})`);
  }
  if (!miss.asked.length && !miss.unreachable.length) {
    parts.push('and it found no other PUF-AM hub on this Wi‑Fi');
  }

  return (
    `${parts.join(' ')}. On the owner's laptop, open Settings → Offline & sync → ` +
    `Send this farm and press it again, then read out the new ticket — a ticket only ` +
    `lives on the laptop that minted it, and only until it expires.`
  );
}

/**
 * A shelf entry as the People page sees it: everything the owner needs to
 * recognise the row, and no ticket.
 *
 * The preset and module list are read back out of the manifest's `permissions`
 * bag rather than stored a second time on the entry — `readJoinGrant` is the
 * one place that knows how to read a ticket minted at any point in this
 * feature's life, including before presets existed.
 */
function toLedgerRow(entry: JoinManifestEntry): JoinTicketLedgerRow {
  const grant = readJoinGrant(entry.manifest);
  const uses = entry.redeemedAt?.length ?? 0;
  return {
    id: entry.id,
    ...(entry.label ? { label: entry.label } : {}),
    role: grant.role,
    ...(grant.preset ? { preset: grant.preset } : {}),
    modules: grant.modules,
    issuedAt: entry.registeredAt,
    ...(entry.manifest.expires ? { expires: entry.manifest.expires } : {}),
    ...(uses ? { lastUsedAt: entry.redeemedAt?.[uses - 1] } : {}),
    uses,
  };
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

    // The label is the owner's private note ("Dave — spray ute"), so it is read
    // off the body here rather than through `parseJoinManifestV2`, which drops
    // it — a manifest is what the joiner receives and stays minimal.
    const entry = putJoinManifest(manifest, clientKey(req), String(body.label ?? ''));
    // Which shelf a ticket landed on is the first thing to check when a joiner
    // cannot resolve it, so say so where the operator will already be looking.
    console.log(
      `[join-ticket] registered ${manifest.ticket} (${manifest.role}) → ${joinManifestStoreLocation()}`,
    );
    return res.json({
      ok: true,
      ticket: manifest.ticket,
      role: manifest.role,
      expires: manifest.expires,
      registeredAt: entry.registeredAt,
      manifests: countJoinManifests(),
      shelf: joinManifestStoreLocation(),
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
    // The only moment this hub hears about a joiner: they asked what the ticket
    // means, so the People page can say when it was last used.
    markJoinManifestRedeemed(ticket);
    return res.json({ manifest: entry.manifest, registeredAt: entry.registeredAt });
  });

  /**
   * The owner's People list — every live ticket this hub minted for a farm,
   * with the ticket bodies redacted (`shared/sync/joinLedger.ts`).
   *
   * LAN-scoped like register and revoke. On the desktop shell that means the
   * loopback token; on the tablet hub it means a paired device. Neither is a
   * farm membership check, because a Freenet farm has no identity to check
   * against — the same honest limit the rest of this file works under.
   */
  app.get('/api/sync/join-tickets', (req: Request, res: Response) => {
    if (!isPrivateHost(String(req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/, ''))) {
      return res.status(403).json({ error: 'Join tickets may only be listed from this LAN' });
    }

    const farmId = String(req.query.farmId || '').trim();
    if (!farmId) {
      return res.status(400).json({ error: 'farmId is required' });
    }

    return res.json({
      farmId,
      rows: listJoinManifests(farmId).map(toLedgerRow),
      shelf: joinManifestStoreLocation(),
    });
  });

  /**
   * Revoke by row id rather than by ticket, so the People page never has to
   * hold one. Stops the ticket being handed out again; it does not reach a
   * device that already pulled the farm — see the §4 known limit.
   */
  app.delete('/api/sync/join-tickets/:id', (req: Request, res: Response) => {
    if (!isPrivateHost(String(req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/, ''))) {
      return res.status(403).json({ error: 'Join tickets may only be revoked from this LAN' });
    }
    const revoked = deleteJoinManifestById(String(req.params.id || ''));
    return res.json({ ok: true, revoked, manifests: countJoinManifests() });
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
      if (!('manifest' in outcome)) {
        recordJoinLookupMiss(key);
        const self = selfHubLabel(req.socket.localPort ?? 3000);
        return res.status(404).json({
          error: describeResolveMiss(ticket, outcome, self),
          ticket,
          hub: self,
          shelf: joinManifestStoreLocation(),
          askedHubs: outcome.asked,
          unreachableHubs: outcome.unreachable,
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
