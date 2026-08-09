/**
 * The Wi‑Fi shelf a **Freenet farm** can actually use.
 *
 * `/api/sync/lan/*` — the `.pufom` shelf — verifies a Firebase ID token and a
 * farm membership document. A Freenet farm has neither: no cloud account, no
 * Firestore, nothing for `verifyFarmMember` to check. So on exactly the farms
 * that most need a shed-speed pipe, every LAN push and pull failed with
 * "Sign in to use LAN sync" long before it reached the network.
 *
 * This shelf answers that with the same trade the rest of the Freenet path
 * makes: **the hub only ever holds ciphertext.** The body is a `.pufom` bundle
 * AEAD-sealed with the farm's FarmSeed on the device that pushed it, so a hub —
 * or anything else on the Wi‑Fi that gets past the pairing gate — holds bytes it
 * cannot open, exactly as a Freenet peer does. That is the seam rule in
 * `Plans/SETTINGS_SYNC_AND_CREW.md` §7 (ciphertext only), applied one hop
 * earlier.
 *
 * Deliberately **not** authenticated per farm. There is no server-side secret a
 * Freenet farm could be checked against, and inventing one (a registered
 * verification key, trust-on-first-use) would put a second identity system
 * beside the FarmCode for no gain: whoever can open the blob already holds the
 * FarmCode, and whoever cannot gains nothing by holding it. On a packaged
 * desktop hub every `/api/sync/*` path is already behind the paired-device
 * token (`desktop/lanHubAuth.ts` → `LAN_SCOPE_PREFIXES`), which is the access
 * control that exists.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §9
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Express, Request, Response } from 'express';

/** A farm with photos in its diary is still well under this; a mistake is not. */
const MAX_SEALED_BYTES = 64 * 1024 * 1024;

export const MIST_SHELF_HASH_HEADER = 'x-puf-content-hash';
export const MIST_SHELF_DEVICE_HEADER = 'x-puf-device-label';

type SealedEntry = {
  farmId: string;
  bytes: Buffer;
  /**
   * Digest of the *plaintext* bundle, supplied by the pusher.
   *
   * Not a checksum of `bytes`: the AEAD nonce is fresh on every seal, so two
   * seals of an unchanged farm differ byte for byte. A device compares this to
   * decide whether the shelf already holds what it was about to send, which is
   * what keeps an idle farm from re-uploading itself every few minutes.
   */
  contentHash: string;
  updatedAt: string;
  deviceLabel: string;
};

const shelf = new Map<string, SealedEntry>();

/**
 * The in-memory map is the shelf; disk is only so a hub restart does not lose
 * the farm. A packaged app can be launched from a directory it may not write to,
 * and that must degrade to "this hub forgets on restart" rather than 500 every
 * request.
 */
function shelfDir(): string {
  const dir = join(process.cwd(), 'tmp', 'lan-sync', 'mist');
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    /* persistence is best-effort; see above */
  }
  return dir;
}

function shelfPath(farmId: string): string {
  return join(shelfDir(), `${farmId.replace(/[^\w\-]+/g, '_')}.sealed`);
}

function metaPath(farmId: string): string {
  return `${shelfPath(farmId)}.meta.json`;
}

function persist(entry: SealedEntry): void {
  try {
    writeFileSync(shelfPath(entry.farmId), entry.bytes);
    writeFileSync(
      metaPath(entry.farmId),
      JSON.stringify({
        farmId: entry.farmId,
        contentHash: entry.contentHash,
        updatedAt: entry.updatedAt,
        deviceLabel: entry.deviceLabel,
        bytes: entry.bytes.length,
      }),
    );
  } catch (e) {
    console.warn('[mist-shelf] persist failed', e);
  }
}

function loadFromDisk(farmId: string): SealedEntry | null {
  const path = shelfPath(farmId);
  if (!existsSync(path)) return null;
  try {
    const bytes = readFileSync(path);
    let meta: Partial<SealedEntry> = {};
    if (existsSync(metaPath(farmId))) {
      meta = JSON.parse(readFileSync(metaPath(farmId), 'utf8')) as Partial<SealedEntry>;
    }
    return {
      farmId,
      bytes,
      contentHash: String(meta.contentHash || ''),
      updatedAt: String(meta.updatedAt || new Date().toISOString()),
      deviceLabel: String(meta.deviceLabel || 'unknown device'),
    };
  } catch {
    return null;
  }
}

function getEntry(farmId: string): SealedEntry | null {
  const held = shelf.get(farmId);
  if (held) return held;
  const loaded = loadFromDisk(farmId);
  if (loaded) shelf.set(farmId, loaded);
  return loaded;
}

function header(req: Request, name: string): string {
  const raw = req.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, 120);
}

function describe(entry: SealedEntry) {
  return {
    farmId: entry.farmId,
    contentHash: entry.contentHash,
    updatedAt: entry.updatedAt,
    deviceLabel: entry.deviceLabel,
    bytes: entry.bytes.length,
  };
}

/**
 * Registered from `registerLanSyncRoutes` so it lands under `/api/sync/`, which
 * is the prefix a paired tablet is already scoped to on a desktop LAN hub.
 */
export function registerMistLanShelfRoutes(app: Express): void {
  /** What the shelf holds, without moving the farm itself. */
  app.get('/api/sync/mist/:farmId/meta', (req: Request, res: Response) => {
    const farmId = String(req.params.farmId || '');
    if (!farmId) return res.status(400).json({ error: 'farmId required' });
    const entry = getEntry(farmId);
    if (!entry) return res.status(404).json({ error: 'No sealed bundle for this farm yet' });
    return res.json(describe(entry));
  });

  app.get('/api/sync/mist/:farmId', (req: Request, res: Response) => {
    const farmId = String(req.params.farmId || '');
    if (!farmId) return res.status(400).json({ error: 'farmId required' });
    const entry = getEntry(farmId);
    if (!entry) return res.status(404).json({ error: 'No sealed bundle for this farm yet' });
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(MIST_SHELF_HASH_HEADER, entry.contentHash);
    res.setHeader('X-Pufom-Updated-At', entry.updatedAt);
    return res.send(entry.bytes);
  });

  app.post('/api/sync/mist/:farmId', rawSealedBody, (req: Request, res: Response) => {
    const farmId = String(req.params.farmId || '');
    if (!farmId) return res.status(400).json({ error: 'farmId required' });

    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!bytes.length) return res.status(400).json({ error: 'Empty body' });
    if (bytes.length > MAX_SEALED_BYTES) {
      return res.status(413).json({ error: 'Sealed bundle too large for this shelf' });
    }

    const contentHash = header(req, MIST_SHELF_HASH_HEADER);
    if (!contentHash) {
      return res.status(400).json({ error: `${MIST_SHELF_HASH_HEADER} header required` });
    }

    const entry: SealedEntry = {
      farmId,
      bytes,
      contentHash,
      updatedAt: new Date().toISOString(),
      deviceLabel: header(req, MIST_SHELF_DEVICE_HEADER) || 'unknown device',
    };
    shelf.set(farmId, entry);
    persist(entry);
    return res.json(describe(entry));
  });
}

/**
 * `express.json()` leaves an `application/octet-stream` body alone, so it
 * arrives here as an unread stream. Same shape as the `.pufom` shelf's own raw
 * middleware, kept local so neither route can change the other's parsing.
 */
function rawSealedBody(req: Request, _res: Response, next: (err?: unknown) => void): void {
  if (req.readableEnded || Buffer.isBuffer(req.body)) {
    next();
    return;
  }
  const chunks: Buffer[] = [];
  let total = 0;
  req.on('data', (chunk: Buffer) => {
    total += chunk.length;
    // Stop reading a body that is already too big rather than buffering it all
    // and rejecting afterwards.
    if (total > MAX_SEALED_BYTES) {
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    req.body = Buffer.concat(chunks);
    next();
  });
  req.on('error', next);
}

/** Tests: forget everything this process is holding. */
export function resetMistLanShelfForTests(): void {
  shelf.clear();
}
