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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isJoinManifestExpired,
  normalizeJoinTicket,
  parseJoinManifestV2,
  type JoinManifestV2,
} from '../shared/sync/joinTicket.ts';

export type JoinManifestEntry = {
  manifest: JoinManifestV2;
  registeredAt: string;
  registeredBy?: string;
};

const manifests = new Map<string, JoinManifestEntry>();
let loadedFromDisk = false;

function storePath(): string {
  const dir = join(process.cwd(), 'tmp', 'lan-sync');
  mkdirSync(dir, { recursive: true });
  return join(dir, 'join-manifests.json');
}

function persist(): void {
  try {
    writeFileSync(
      storePath(),
      JSON.stringify({ v: 2, entries: Array.from(manifests.values()) }, null, 2),
    );
  } catch (error) {
    console.warn('[join-ticket] persist failed', error);
  }
}

/**
 * A hub restart must not invalidate a ticket the owner already read out loud, so
 * the shelf survives on disk like the bundle shelf does.
 */
function loadOnce(): void {
  if (loadedFromDisk) return;
  loadedFromDisk = true;
  try {
    const raw = JSON.parse(readFileSync(storePath(), 'utf8')) as {
      entries?: unknown[];
    };
    for (const candidate of raw.entries || []) {
      const entry = candidate as Partial<JoinManifestEntry>;
      const manifest = parseJoinManifestV2(entry.manifest);
      if (!manifest || isJoinManifestExpired(manifest)) continue;
      manifests.set(manifest.ticket, {
        manifest,
        registeredAt: String(entry.registeredAt || new Date().toISOString()),
        ...(entry.registeredBy ? { registeredBy: String(entry.registeredBy) } : {}),
      });
    }
  } catch {
    /* no shelf yet */
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
): JoinManifestEntry {
  loadOnce();
  pruneExpired();
  const entry: JoinManifestEntry = {
    manifest,
    registeredAt: new Date().toISOString(),
    ...(registeredBy ? { registeredBy } : {}),
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
  loadOnce();
  pruneExpired();
  const canonical = normalizeJoinTicket(ticket);
  if (!canonical) return null;
  return manifests.get(canonical) ?? null;
}

export function deleteJoinManifest(ticket: string): boolean {
  loadOnce();
  const canonical = normalizeJoinTicket(ticket);
  if (!canonical) return false;
  const removed = manifests.delete(canonical);
  if (removed) persist();
  return removed;
}

/** Non-secret summary for the owner's UI — tickets themselves are not listed. */
export function countJoinManifests(): number {
  loadOnce();
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

/** Test seam — drops the in-memory shelf without touching disk state on purpose. */
export function resetJoinManifestsForTest(): void {
  manifests.clear();
  misses.clear();
  loadedFromDisk = true;
}
