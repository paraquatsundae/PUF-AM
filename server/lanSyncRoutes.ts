/**
 * Workshop LAN peer shelf for .pufom bundles.
 * Devices on the same Wi‑Fi push/pull via the Express host (PC running npm run dev).
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Express, Request, Response } from 'express';
import { getAdminAuth, getAdminDb, isAdminSdkReady } from './firebaseAdmin.ts';
import {
  getSelfPeer,
  listLanIpv4,
  listPufomPeers,
  refreshPufomMdnsBrowse,
} from './mdnsHub.ts';
import {
  clearLanPresence,
  listLanPresence,
  upsertLanPresence,
  type LanPresenceEntry,
  type LanTrailPoint,
} from './lanPresenceStore.ts';
import {
  clearLanHighlight,
  listLanHighlights,
  upsertLanHighlight,
  type LanHighlightEntry,
} from './lanHighlightStore.ts';
import { registerJoinTicketRoutes } from './joinTicketRoutes.ts';
import { registerMistLanShelfRoutes } from './mistLanShelfRoutes.ts';

type ShelfEntry = {
  farmId: string;
  bytes: Buffer;
  updatedAt: string;
  exportedAt?: string;
  uploadedBy: string;
};

const shelf = new Map<string, ShelfEntry>();

function shelfDir(): string {
  const dir = join(process.cwd(), 'tmp', 'lan-sync');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function shelfPath(farmId: string): string {
  const safe = farmId.replace(/[^\w\-]+/g, '_');
  return join(shelfDir(), `${safe}.pufom`);
}

function persist(entry: ShelfEntry): void {
  try {
    writeFileSync(shelfPath(entry.farmId), entry.bytes);
    writeFileSync(
      `${shelfPath(entry.farmId)}.meta.json`,
      JSON.stringify({
        farmId: entry.farmId,
        updatedAt: entry.updatedAt,
        exportedAt: entry.exportedAt,
        uploadedBy: entry.uploadedBy,
        bytes: entry.bytes.length,
      })
    );
  } catch (e) {
    console.warn('[lan-sync] persist failed', e);
  }
}

function loadFromDisk(farmId: string): ShelfEntry | null {
  const path = shelfPath(farmId);
  if (!existsSync(path)) return null;
  try {
    const bytes = readFileSync(path);
    let meta: Partial<ShelfEntry> = {};
    const metaPath = `${path}.meta.json`;
    if (existsSync(metaPath)) {
      meta = JSON.parse(readFileSync(metaPath, 'utf8')) as Partial<ShelfEntry>;
    }
    return {
      farmId,
      bytes,
      updatedAt: meta.updatedAt || new Date().toISOString(),
      exportedAt: meta.exportedAt,
      uploadedBy: meta.uploadedBy || 'unknown',
    };
  } catch {
    return null;
  }
}

function getEntry(farmId: string): ShelfEntry | null {
  return shelf.get(farmId) || loadFromDisk(farmId);
}

async function verifyFarmMember(req: Request, farmId: string): Promise<{ uid: string }> {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    throw Object.assign(new Error('Missing Authorization bearer token'), { status: 401 });
  }
  if (!isAdminSdkReady()) {
    throw Object.assign(new Error('Firebase Admin not configured'), { status: 503 });
  }
  const decoded = await getAdminAuth().verifyIdToken(token);
  const claimFarm =
    typeof decoded.farmId === 'string' ? decoded.farmId : undefined;
  if (claimFarm === farmId) return { uid: decoded.uid };

  const userSnap = await getAdminDb().collection('users').doc(decoded.uid).get();
  if (userSnap.exists && userSnap.data()?.farmId === farmId) {
    return { uid: decoded.uid };
  }
  throw Object.assign(new Error('Not a member of this farm'), { status: 403 });
}

export function registerLanSyncRoutes(app: Express): void {
  // Short join tickets resolve over the same LAN shelf idea; see joinTicketRoutes.ts.
  registerJoinTicketRoutes(app);
  // The same shelf for a farm with no cloud account to authenticate against —
  // sealed bytes only. See mistLanShelfRoutes.ts for why it is not per-farm
  // authenticated, and Plans/SETTINGS_SYNC_AND_CREW.md §9.
  registerMistLanShelfRoutes(app);

  /** This hub's mDNS identity + LAN IPs (no auth — used before / after sign-in). */
  app.get('/api/sync/self', (_req: Request, res: Response) => {
    const self = getSelfPeer();
    return res.json({
      mdnsType: 'pufom-sync',
      self,
      lanIpv4: listLanIpv4(),
      mdnsEnabled: Boolean(self),
    });
  });

  /** Browse for other PUFOM sync hubs on the LAN (mDNS). */
  app.get('/api/sync/peers', async (req: Request, res: Response) => {
    try {
      const waitMs = Math.min(5000, Math.max(500, Number(req.query.waitMs) || 2500));
      const peers = await refreshPufomMdnsBrowse(waitMs);
      return res.json({
        peers: peers.length ? peers : listPufomPeers(),
        scannedAt: new Date().toISOString(),
        waitMs,
      });
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Peer scan failed',
        peers: listPufomPeers(),
      });
    }
  });

  // Raw body for binary .pufom upload (must be before json parser for this path — use verify)
  app.post(
    '/api/sync/lan/:farmId',
    expressRawMiddleware,
    async (req: Request, res: Response) => {
      try {
        const farmId = String(req.params.farmId || '');
        if (!farmId) return res.status(400).json({ error: 'farmId required' });
        const { uid } = await verifyFarmMember(req, farmId);

        const body = req.body as Buffer | undefined;
        if (!body || !Buffer.isBuffer(body) || body.length < 8) {
          return res.status(400).json({ error: 'Expected raw .pufom body' });
        }
        if (body.length > 40 * 1024 * 1024) {
          return res.status(413).json({ error: 'Bundle too large (max 40 MB)' });
        }

        const entry: ShelfEntry = {
          farmId,
          bytes: body,
          updatedAt: new Date().toISOString(),
          uploadedBy: uid,
        };
        shelf.set(farmId, entry);
        persist(entry);
        return res.json({
          ok: true,
          farmId,
          bytes: body.length,
          updatedAt: entry.updatedAt,
        });
      } catch (error: unknown) {
        const status = (error as { status?: number })?.status || 500;
        return res.status(status).json({
          error: error instanceof Error ? error.message : 'LAN push failed',
        });
      }
    }
  );

  app.get('/api/sync/lan/:farmId/meta', async (req: Request, res: Response) => {
    try {
      const farmId = String(req.params.farmId || '');
      await verifyFarmMember(req, farmId);
      const entry = getEntry(farmId);
      if (!entry) return res.status(404).json({ error: 'No LAN bundle for this farm yet' });
      if (!shelf.has(farmId)) shelf.set(farmId, entry);
      return res.json({
        farmId,
        updatedAt: entry.updatedAt,
        exportedAt: entry.exportedAt,
        bytes: entry.bytes.length,
        uploadedBy: entry.uploadedBy,
      });
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status || 500;
      return res.status(status).json({
        error: error instanceof Error ? error.message : 'LAN meta failed',
      });
    }
  });

  app.get('/api/sync/lan/:farmId', async (req: Request, res: Response) => {
    try {
      const farmId = String(req.params.farmId || '');
      await verifyFarmMember(req, farmId);
      const entry = getEntry(farmId);
      if (!entry) return res.status(404).json({ error: 'No LAN bundle for this farm yet' });
      if (!shelf.has(farmId)) shelf.set(farmId, entry);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${farmId}.pufom"`);
      res.setHeader('X-Pufom-Updated-At', entry.updatedAt);
      return res.send(entry.bytes);
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status || 500;
      return res.status(status).json({
        error: error instanceof Error ? error.message : 'LAN pull failed',
      });
    }
  });

  /** Crew presence — in-memory shelf on this hub (CREW_PRESENCE P2). */
  app.post('/api/presence/:farmId', async (req: Request, res: Response) => {
    try {
      const farmId = String(req.params.farmId || '');
      if (!farmId) return res.status(400).json({ error: 'farmId required' });
      const { uid } = await verifyFarmMember(req, farmId);
      const body = (req.body || {}) as Partial<LanPresenceEntry>;
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: 'lat/lng required' });
      }
      const rawTrail = Array.isArray(body.trail) ? body.trail : [];
      const trail: LanTrailPoint[] = [];
      const nowMs = Date.now();
      for (const p of rawTrail) {
        const pt = p as Partial<LanTrailPoint>;
        const plat = Number(pt.lat);
        const plng = Number(pt.lng);
        const ptMs = Number(pt.t);
        if (!Number.isFinite(plat) || !Number.isFinite(plng) || !Number.isFinite(ptMs)) continue;
        if (nowMs - ptMs > 120_000) continue;
        trail.push({ lat: plat, lng: plng, t: ptMs });
        if (trail.length >= 250) break;
      }
      const entry: LanPresenceEntry = {
        uid,
        displayName: String(body.displayName || 'Crew').slice(0, 100),
        lat,
        lng,
        accuracyM:
          typeof body.accuracyM === 'number' && Number.isFinite(body.accuracyM)
            ? body.accuracyM
            : null,
        headingDeg:
          typeof body.headingDeg === 'number' && Number.isFinite(body.headingDeg)
            ? body.headingDeg
            : typeof (body as { heading?: unknown }).heading === 'number' &&
                Number.isFinite((body as { heading: number }).heading)
              ? (body as { heading: number }).heading
              : null,
        speedMps:
          typeof body.speedMps === 'number' && Number.isFinite(body.speedMps)
            ? body.speedMps
            : null,
        kind: body.kind === 'vehicle' ? 'vehicle' : 'person',
        trail,
        updatedAt: new Date().toISOString(),
        source: body.source === 'manual' ? 'manual' : 'gps',
      };
      upsertLanPresence(farmId, entry);
      return res.json({ ok: true, entry });
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status || 500;
      return res.status(status).json({
        error: error instanceof Error ? error.message : 'Presence upsert failed',
      });
    }
  });

  app.delete('/api/presence/:farmId/me', async (req: Request, res: Response) => {
    try {
      const farmId = String(req.params.farmId || '');
      if (!farmId) return res.status(400).json({ error: 'farmId required' });
      const { uid } = await verifyFarmMember(req, farmId);
      clearLanPresence(farmId, uid);
      return res.json({ ok: true });
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status || 500;
      return res.status(status).json({
        error: error instanceof Error ? error.message : 'Presence clear failed',
      });
    }
  });

  app.get('/api/presence/:farmId', async (req: Request, res: Response) => {
    try {
      const farmId = String(req.params.farmId || '');
      if (!farmId) return res.status(400).json({ error: 'farmId required' });
      await verifyFarmMember(req, farmId);
      const entries = listLanPresence(farmId);
      return res.json({ farmId, entries, at: new Date().toISOString() });
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status || 500;
      return res.status(status).json({
        error: error instanceof Error ? error.message : 'Presence list failed',
      });
    }
  });

  /** Timed map highlights — in-memory shelf (MAP_OVERLAYS). */
  app.post('/api/highlights/:farmId', async (req: Request, res: Response) => {
    try {
      const farmId = String(req.params.farmId || '');
      if (!farmId) return res.status(400).json({ error: 'farmId required' });
      const { uid } = await verifyFarmMember(req, farmId);
      const body = (req.body || {}) as Partial<LanHighlightEntry>;
      const id = String(body.id || '').slice(0, 80);
      if (!id) return res.status(400).json({ error: 'id required' });
      if (!body.geojson) return res.status(400).json({ error: 'geojson required' });
      const expiresAt = String(body.expiresAt || '');
      const createdAt = String(body.createdAt || new Date().toISOString());
      if (!expiresAt || !Number.isFinite(Date.parse(expiresAt))) {
        return res.status(400).json({ error: 'expiresAt required' });
      }
      if (Date.parse(expiresAt) <= Date.now()) {
        return res.status(400).json({ error: 'highlight already expired' });
      }
      const audience =
        body.audience === 'all' || body.audience == null
          ? 'all'
          : Array.isArray(body.audience)
            ? body.audience.map(String).slice(0, 40)
            : 'all';
      const entry: LanHighlightEntry = {
        id,
        geojson: body.geojson,
        createdBy: uid,
        displayName: String(body.displayName || 'Crew').slice(0, 100),
        colour: typeof body.colour === 'string' ? body.colour.slice(0, 40) : undefined,
        note: typeof body.note === 'string' ? body.note.slice(0, 280) : undefined,
        audience,
        expiresAt,
        createdAt,
      };
      upsertLanHighlight(farmId, entry);
      return res.json({ ok: true, entry });
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status || 500;
      return res.status(status).json({
        error: error instanceof Error ? error.message : 'Highlight upsert failed',
      });
    }
  });

  app.delete('/api/highlights/:farmId/:id', async (req: Request, res: Response) => {
    try {
      const farmId = String(req.params.farmId || '');
      const id = String(req.params.id || '');
      if (!farmId || !id) return res.status(400).json({ error: 'farmId and id required' });
      await verifyFarmMember(req, farmId);
      clearLanHighlight(farmId, id);
      return res.json({ ok: true });
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status || 500;
      return res.status(status).json({
        error: error instanceof Error ? error.message : 'Highlight delete failed',
      });
    }
  });

  app.get('/api/highlights/:farmId', async (req: Request, res: Response) => {
    try {
      const farmId = String(req.params.farmId || '');
      if (!farmId) return res.status(400).json({ error: 'farmId required' });
      await verifyFarmMember(req, farmId);
      const entries = listLanHighlights(farmId);
      return res.json({ farmId, entries, at: new Date().toISOString() });
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status || 500;
      return res.status(status).json({
        error: error instanceof Error ? error.message : 'Highlight list failed',
      });
    }
  });
}

/** Capture raw body for this route only. */
function expressRawMiddleware(req: Request, res: Response, next: (err?: unknown) => void): void {
  if (req.readableEnded || Buffer.isBuffer(req.body)) {
    next();
    return;
  }
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    req.body = Buffer.concat(chunks);
    next();
  });
  req.on('error', next);
}
