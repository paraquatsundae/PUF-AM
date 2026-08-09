/**
 * The shelf is shared by every PUF-AM process on one machine, and that is the
 * whole point of it: the owner mints a ticket in whichever app is open and the
 * joiner's tablet asks whichever hub it found. These tests pin the two halves
 * that broke — one shelf per machine, and a hub noticing a ticket that landed
 * after it started.
 */
import { mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import type { JoinManifestV2 } from '../shared/sync/joinTicket.ts';

const shelfDir = mkdtempSync(join(tmpdir(), 'pufom-lan-sync-'));
process.env.PUFOM_LAN_SYNC_DIR = shelfDir;

const shelfFile = join(shelfDir, 'join-manifests.json');

function manifest(ticket: string, overrides: Partial<JoinManifestV2> = {}): JoinManifestV2 {
  return {
    v: 2,
    farmId: 'farm-abc',
    hotUri: 'FN02@hot',
    bonesUri: 'FN02@bones',
    role: 'farmer',
    ticket,
    ...overrides,
  };
}

/** Stand in for the desktop app writing the shelf while a dev-server hub is up. */
function writeShelfAsAnotherProcess(entries: JoinManifestV2[]): void {
  writeFileSync(
    shelfFile,
    JSON.stringify({
      v: 2,
      entries: entries.map((m) => ({
        manifest: m,
        registeredAt: new Date().toISOString(),
        registeredBy: '127.0.0.1',
      })),
    }),
  );
  // Coarse mtime clocks would otherwise let a same-millisecond write look unchanged.
  const bumped = new Date(statSync(shelfFile).mtimeMs + 2000);
  utimesSync(shelfFile, bumped, bumped);
}

let store: typeof import('../server/joinManifestStore.ts');

beforeAll(async () => {
  store = await import('../server/joinManifestStore.ts');
});

describe('join manifest shelf', () => {
  it('writes to the machine-scoped dir rather than the working directory', () => {
    store.putJoinManifest(manifest('PUF-K7M2-9Q4X'));

    expect(store.joinManifestStoreLocation()).toBe(shelfFile);
    const raw = JSON.parse(readFileSync(shelfFile, 'utf8')) as { entries: unknown[] };
    expect(raw.entries).toHaveLength(1);
  });

  it('round-trips a ticket it registered itself', () => {
    store.putJoinManifest(manifest('PUF-0000-0001'));

    expect(store.getJoinManifest('PUF-0000-0001')?.manifest.hotUri).toBe('FN02@hot');
  });

  it('normalizes a sloppily typed ticket on lookup', () => {
    store.putJoinManifest(manifest('PUF-0000-0002'));

    expect(store.getJoinManifest('puf 0000 ooo2')?.manifest.ticket).toBe('PUF-0000-0002');
  });

  it('sees a ticket another process registered after this hub started', () => {
    expect(store.getJoinManifest('PUF-5XYV-WRFV')).toBeNull();

    writeShelfAsAnotherProcess([manifest('PUF-5XYV-WRFV', { role: 'owner' })]);

    expect(store.getJoinManifest('PUF-5XYV-WRFV')?.manifest.role).toBe('owner');
  });

  it('keeps its own tickets when it folds in another process shelf', () => {
    store.putJoinManifest(manifest('PUF-0000-0003'));
    writeShelfAsAnotherProcess([manifest('PUF-0000-0004')]);

    expect(store.getJoinManifest('PUF-0000-0004')).not.toBeNull();
    expect(store.getJoinManifest('PUF-0000-0003')).not.toBeNull();
  });

  it('refuses to serve an expired ticket even when it is on the shelf', () => {
    writeShelfAsAnotherProcess([
      manifest('PUF-0000-0005', { expires: new Date(Date.now() - 1000).toISOString() }),
    ]);

    expect(store.getJoinManifest('PUF-0000-0005')).toBeNull();
  });

  it('forgets a revoked ticket', () => {
    store.putJoinManifest(manifest('PUF-0000-0006'));

    expect(store.deleteJoinManifest('PUF-0000-0006')).toBe(true);
    expect(store.getJoinManifest('PUF-0000-0006')).toBeNull();
  });
});
