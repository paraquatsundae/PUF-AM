/**
 * Join manifest shelf — a LAN hub's answer to "what does ticket PUF-K7M2-9Q4X mean?".
 *
 * The owner's hub registers a manifest when it publishes a farm; a joiner on the
 * same Wi‑Fi presents the ticket and gets back the FN02 URIs to pull. Kept next
 * to the `.pufom` shelf in `lanSyncRoutes` because it is the same idea: a
 * workshop-scoped shelf on the machine running the Express host.
 *
 * The ticket is the only credential, so this shelf holds nothing that is
 * dangerous to hand over: FN02 URIs point at AEAD ciphertext that only a
 * FarmCode-derived key opens. Brute force is still worth blunting, hence the
 * miss counter below.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  isJoinManifestExpired,
  normalizeJoinTicket,
  parseJoinManifestV2,
  type JoinManifestV2,
} from '../shared/sync/joinTicket.ts';

/**
 * A shelf entry is the **owner's private record** of a ticket they handed out;
 * the manifest inside it is the only part a joiner ever receives.
 *
 * That split is what lets this double as the personnel ledger a Freenet farm
 * otherwise has no room for (`Plans/SETTINGS_SYNC_AND_CREW.md` §4a): the label
 * and the redemption stamps are added here, next to the ticket, without
 * touching the wire format or making the roster something every joiner rewrites.
 */
export type JoinManifestEntry = {
  /**
   * Random, and deliberately not derived from the ticket.
   *
   * The People list has to name a row to revoke it, and a ticket is a bearer
   * capability that must not be listed. A hash would not do either: a ticket is
   * 40 bits, so `sha256(ticket)` is worth about a minute of GPU time to invert.
   */
  id: string;
  manifest: JoinManifestV2;
  registeredAt: string;
  registeredBy?: string;
  /** What the owner typed when they sent the farm — "Dave — spray ute". */
  label?: string;
  /** One ISO stamp per time this ticket was looked up, oldest first. */
  redeemedAt?: string[];
};

/** Enough to answer "has anyone actually used it, and when" without growing forever. */
const MAX_REDEMPTION_STAMPS = 20;

const manifests = new Map<string, JoinManifestEntry>();
let lastSeenMtimeMs = -1;
let legacyImported = false;
/** Set by the test seam so a unit test never reads or writes the operator's real shelf. */
let diskDisabled = false;

/**
 * Per-user, not per-working-directory.
 *
 * A ticket is minted by whichever PUF-AM the owner happened to open and looked
 * up by whichever hub the joiner's tablet happened to find, and on a workshop
 * laptop those are two different processes: the packaged app's loopback API
 * (`desktop/localApi.ts`, cwd = wherever the launcher sat) and `npm run dev`
 * (cwd = the repo). A `process.cwd()`-relative shelf gave each of them a
 * private one, so the owner pressed **Send this farm** in the desktop app and
 * the tablet asked the dev server — which truthfully answered that no hub on
 * this Wi‑Fi knew the ticket. The shelf is a property of the *machine*, so it
 * is addressed like one.
 */
function storeDir(): string {
  const override = process.env.PUFOM_LAN_SYNC_DIR?.trim();
  return override || join(homedir(), '.pufom', 'lan-sync');
}

function storePath(): string {
  const dir = storeDir();
  mkdirSync(dir, { recursive: true });
  return join(dir, 'join-manifests.json');
}

/** Where hubs before the shared-shelf fix wrote — read once so live tickets survive an upgrade. */
function legacyStorePath(): string {
  return join(process.cwd(), 'tmp', 'lan-sync', 'join-manifests.json');
}

function persist(): void {
  if (diskDisabled) return;
  try {
    const path = storePath();
    writeFileSync(path, JSON.stringify({ v: 2, entries: Array.from(manifests.values()) }, null, 2));
    lastSeenMtimeMs = statSync(path).mtimeMs;
  } catch (error) {
    console.warn('[join-ticket] persist failed', error);
  }
}

/** Owner-typed free text, kept short and single-line so it cannot become a payload. */
export function sanitizeJoinLabel(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const cleaned = raw.replace(/\s+/g, ' ').trim().slice(0, 60);
  return cleaned || undefined;
}

function coerceRedemptions(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const stamps = raw
    .filter((at): at is string => typeof at === 'string' && Number.isFinite(Date.parse(at)))
    .slice(-MAX_REDEMPTION_STAMPS);
  return stamps.length ? stamps : undefined;
}

/**
 * Fold a shelf file into memory. Newer registrations win; nothing is dropped.
 *
 * An entry written before §4a has no `id`, so one is minted on the way in — the
 * shelf outlives the version that wrote it, and a live ticket must not become
 * unrevokable just because it predates the People page.
 */
function mergeFile(path: string): void {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { entries?: unknown[] };
  for (const candidate of raw.entries || []) {
    const entry = candidate as Partial<JoinManifestEntry>;
    const manifest = parseJoinManifestV2(entry.manifest);
    if (!manifest || isJoinManifestExpired(manifest)) continue;
    const registeredAt = String(entry.registeredAt || new Date().toISOString());
    const existing = manifests.get(manifest.ticket);
    if (existing && existing.registeredAt > registeredAt) continue;
    const label = sanitizeJoinLabel(entry.label);
    const redeemedAt = coerceRedemptions(entry.redeemedAt);
    manifests.set(manifest.ticket, {
      id: typeof entry.id === 'string' && entry.id ? entry.id : randomUUID(),
      manifest,
      registeredAt,
      ...(entry.registeredBy ? { registeredBy: String(entry.registeredBy) } : {}),
      ...(label ? { label } : {}),
      ...(redeemedAt ? { redeemedAt } : {}),
    });
  }
}

/**
 * Re-read the shelf whenever it has changed underneath us.
 *
 * A hub restart must not invalidate a ticket the owner already read out loud —
 * but neither must a hub that was *already running* when another process on
 * this machine minted one. Loading once at first touch was enough while the
 * shelf had a single writer; sharing it between the desktop app and the dev
 * server means the file is the source of truth and memory is just a cache.
 */
function syncFromDisk(): void {
  if (diskDisabled) return;

  let path: string;
  try {
    path = storePath();
  } catch {
    return;
  }

  let mtimeMs: number | null = null;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    /* no shelf yet — the legacy import below may still create one */
  }

  if (mtimeMs !== null && mtimeMs !== lastSeenMtimeMs) {
    lastSeenMtimeMs = mtimeMs;
    try {
      mergeFile(path);
    } catch {
      /* unreadable or half-written — keep what we have */
    }
  }

  // Only after the shared shelf is in memory, or the write below would drop it.
  if (legacyImported) return;
  legacyImported = true;
  const legacy = legacyStorePath();
  if (legacy === path) return;
  const before = manifests.size;
  try {
    mergeFile(legacy);
  } catch {
    return; // no legacy shelf
  }
  if (manifests.size > before) {
    console.log(`[join-ticket] imported ${manifests.size - before} ticket(s) from ${legacy}`);
    persist();
  }
}

function pruneExpired(): void {
  const now = Date.now();
  let dropped = false;
  for (const [ticket, entry] of manifests) {
    if (isJoinManifestExpired(entry.manifest, now)) {
      manifests.delete(ticket);
      dropped = true;
    }
  }
  if (dropped) persist();
}

/** A workshop hub serves one farm's crew, not a directory — evict rather than grow. */
const MAX_MANIFESTS = 200;

export function putJoinManifest(
  manifest: JoinManifestV2,
  registeredBy?: string,
  label?: string,
): JoinManifestEntry {
  syncFromDisk();
  pruneExpired();
  const cleanLabel = sanitizeJoinLabel(label);
  const entry: JoinManifestEntry = {
    id: randomUUID(),
    manifest,
    registeredAt: new Date().toISOString(),
    ...(registeredBy ? { registeredBy } : {}),
    ...(cleanLabel ? { label: cleanLabel } : {}),
  };
  manifests.delete(manifest.ticket);
  manifests.set(manifest.ticket, entry);
  while (manifests.size > MAX_MANIFESTS) {
    const oldest = manifests.keys().next();
    if (oldest.done) break;
    manifests.delete(oldest.value);
  }
  persist();
  return entry;
}

export function getJoinManifest(ticket: string): JoinManifestEntry | null {
  syncFromDisk();
  pruneExpired();
  const canonical = normalizeJoinTicket(ticket);
  if (!canonical) return null;
  return manifests.get(canonical) ?? null;
}

export function deleteJoinManifest(ticket: string): boolean {
  syncFromDisk();
  const canonical = normalizeJoinTicket(ticket);
  if (!canonical) return false;
  const removed = manifests.delete(canonical);
  if (removed) persist();
  return removed;
}

/**
 * Revoke from the People list, which knows a row by its id and deliberately
 * never learns the ticket.
 */
export function deleteJoinManifestById(id: string): boolean {
  syncFromDisk();
  if (!id) return false;
  for (const [ticket, entry] of manifests) {
    if (entry.id !== id) continue;
    manifests.delete(ticket);
    persist();
    return true;
  }
  return false;
}

/**
 * Stamp a ticket that just resolved.
 *
 * A lookup is the closest thing a Freenet farm has to "someone joined": the
 * device asked what this ticket means and got the URIs, so it is about to pull
 * the farm. It is not proof they succeeded — the FarmCode could still be wrong —
 * which is why the People page says *last used* rather than *joined*.
 */
export function markJoinManifestRedeemed(ticket: string, at = new Date()): void {
  const canonical = normalizeJoinTicket(ticket);
  if (!canonical) return;
  const entry = manifests.get(canonical);
  if (!entry) return;
  entry.redeemedAt = [...(entry.redeemedAt ?? []), at.toISOString()].slice(
    -MAX_REDEMPTION_STAMPS,
  );
  persist();
}

/**
 * The owner's ledger for one farm, newest first.
 *
 * Scoped by `farmId` rather than handed over whole: a workshop laptop's shelf
 * can hold tickets for more than one farm, and the People page of one farm has
 * no business listing another's crew.
 */
export function listJoinManifests(farmId: string): JoinManifestEntry[] {
  syncFromDisk();
  pruneExpired();
  const wanted = farmId.trim();
  return Array.from(manifests.values())
    .filter((entry) => !wanted || entry.manifest.farmId === wanted)
    .sort((a, b) => (a.registeredAt < b.registeredAt ? 1 : -1));
}

/** Non-secret summary for the owner's UI — tickets themselves are not listed. */
export function countJoinManifests(): number {
  syncFromDisk();
  pruneExpired();
  return manifests.size;
}

const MISS_WINDOW_MS = 5 * 60 * 1000;
const MISS_LIMIT = 25;
const misses = new Map<string, number[]>();

/**
 * 40 bits of ticket is not guessable, but an open lookup endpoint on a LAN is
 * still worth rate limiting — a wrong ticket is a typo, twenty-five wrong
 * tickets in five minutes is a script.
 */
export function isJoinLookupThrottled(clientKey: string, now = Date.now()): boolean {
  const recent = (misses.get(clientKey) || []).filter((at) => now - at < MISS_WINDOW_MS);
  if (recent.length) misses.set(clientKey, recent);
  else misses.delete(clientKey);
  return recent.length >= MISS_LIMIT;
}

export function recordJoinLookupMiss(clientKey: string, now = Date.now()): void {
  const recent = (misses.get(clientKey) || []).filter((at) => now - at < MISS_WINDOW_MS);
  recent.push(now);
  misses.set(clientKey, recent);
}

export function clearJoinLookupMisses(clientKey: string): void {
  misses.delete(clientKey);
}

/** Test seam — drops the in-memory shelf and stops it reaching the real one on disk. */
export function resetJoinManifestsForTest(): void {
  manifests.clear();
  misses.clear();
  diskDisabled = true;
  legacyImported = true;
  lastSeenMtimeMs = -1;
}

/** Where this hub keeps its shelf — surfaced in diagnostics so two hubs can be compared. */
export function joinManifestStoreLocation(): string {
  return diskDisabled ? '(memory)' : join(storeDir(), 'join-manifests.json');
}
