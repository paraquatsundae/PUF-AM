import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';

import { registerJoinTicketRoutes } from '../../server/joinTicketRoutes.ts';
import { resetJoinManifestsForTest } from '../../server/joinManifestStore.ts';
import { buildJoinPermissions, findJoinPreset } from '../../shared/sync/joinGrant.ts';
import type { JoinTicketLedger } from '../../shared/sync/joinLedger.ts';

const TICKET = 'PUF-K7M2-9Q4X';
const FARM_ID = 'farm-abc';

function manifestBody(overrides: Record<string, unknown> = {}) {
  return {
    v: 2,
    farmId: FARM_ID,
    hotUri: 'FN02@hot',
    bonesUri: 'FN02@bones',
    role: 'farmer',
    ticket: TICKET,
    ...overrides,
  };
}

describe('LAN join ticket routes', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Also marks the shelf as loaded, so a leftover tmp/ file from a previous run
    // cannot leak into these assertions.
    resetJoinManifestsForTest();
    const app = express();
    app.use(express.json());
    registerJoinTicketRoutes(app);
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('Failed to bind test server');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  afterEach(() => {
    resetJoinManifestsForTest();
  });

  const register = (body: Record<string, unknown>) =>
    fetch(`${baseUrl}/api/sync/join-ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('registers a manifest and serves it back by ticket', async () => {
    const posted = await register(manifestBody());
    expect(posted.status).toBe(200);
    expect((await posted.json()).ticket).toBe(TICKET);

    const res = await fetch(`${baseUrl}/api/sync/join-ticket/${TICKET}`);
    expect(res.status).toBe(200);
    const { manifest } = await res.json();
    expect(manifest.farmId).toBe(FARM_ID);
    expect(manifest.hotUri).toBe('FN02@hot');
    expect(manifest.role).toBe('farmer');
  });

  it('accepts a sloppily typed ticket on lookup', async () => {
    await register(manifestBody());

    const res = await fetch(`${baseUrl}/api/sync/join-ticket/${encodeURIComponent('puf-k7m2-9q4x')}`);
    expect(res.status).toBe(200);
  });

  it('defaults an unknown role to farmer rather than refusing the manifest', async () => {
    await register(manifestBody({ role: 'worker' }));

    const res = await fetch(`${baseUrl}/api/sync/join-ticket/${TICKET}`);
    expect((await res.json()).manifest.role).toBe('farmer');
  });

  it('rejects a malformed ticket and an incomplete manifest', async () => {
    expect((await register(manifestBody({ ticket: 'nope' }))).status).toBe(400);
    expect((await register(manifestBody({ hotUri: '' }))).status).toBe(400);
    expect((await register(manifestBody({ v: 1 }))).status).toBe(400);
  });

  it('refuses a manifest that is already expired', async () => {
    const res = await register(manifestBody({ expires: '2020-01-01T00:00:00.000Z' }));
    expect(res.status).toBe(400);
  });

  it('404s an unknown ticket', async () => {
    const res = await fetch(`${baseUrl}/api/sync/join-ticket/PUF-0000-0000`);
    expect(res.status).toBe(404);
  });

  it('resolves from its own shelf without going out to the LAN', async () => {
    await register(manifestBody());

    const res = await fetch(
      `${baseUrl}/api/sync/join-ticket/${TICKET}/resolve?farmId=${FARM_ID}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resolvedFrom).toBe('self');
    expect(body.manifest.bonesUri).toBe('FN02@bones');
  });

  it('refuses to hand a joiner a manifest for a different farm', async () => {
    await register(manifestBody());

    const res = await fetch(
      `${baseUrl}/api/sync/join-ticket/${TICKET}/resolve?farmId=someone-elses-farm`,
    );
    expect(res.status).toBe(409);
  });

  it('rejects an owner address that is not a plain http LAN host', async () => {
    for (const base of ['https://evil.example.com', 'http://8.8.8.8:3000', 'not a url']) {
      const res = await fetch(
        `${baseUrl}/api/sync/join-ticket/${TICKET}/resolve?base=${encodeURIComponent(base)}`,
      );
      expect(res.status).toBe(400);
    }
  });

  /**
   * The old message asserted the joiner was on the wrong Wi‑Fi, which was the
   * least likely cause and unactionable when wrong — a ticket sitting on another
   * process's shelf looks identical from the tablet. Name the hub, say what it
   * tried, and point at the one button that fixes it.
   */
  it('names the hub it asked when nothing can answer', async () => {
    const res = await fetch(`${baseUrl}/api/sync/join-ticket/${TICKET}/resolve`);
    expect(res.status).toBe(404);

    const body = (await res.json()) as {
      error: string;
      hub: string;
      shelf: string;
      askedHubs: string[];
      unreachableHubs: string[];
    };
    expect(body.error).toContain(TICKET);
    expect(body.error).toContain(body.hub);
    expect(body.error).toContain('Send this farm');
    expect(body.shelf).toBeTruthy();
    expect(body.askedHubs).toEqual([]);
    expect(body.unreachableHubs).toEqual([]);
  });

  it('reports a hub it was pointed at but could not reach', async () => {
    // 192.168.0.2:9 passes the LAN guard and refuses fast — an owner address
    // typed a digit wrong is a different problem from an empty shelf.
    const res = await fetch(
      `${baseUrl}/api/sync/join-ticket/${TICKET}/resolve?base=${encodeURIComponent('192.168.0.2:9')}`,
    );
    expect(res.status).toBe(404);

    const body = (await res.json()) as { error: string; unreachableHubs: string[] };
    expect(body.unreachableHubs).toContain('http://192.168.0.2:9');
    expect(body.error).toContain('could not reach');
  });

  it('revokes a ticket so a re-send invalidates the old one', async () => {
    await register(manifestBody());

    const deleted = await fetch(`${baseUrl}/api/sync/join-ticket/${TICKET}`, { method: 'DELETE' });
    expect((await deleted.json()).revoked).toBe(true);
    expect((await fetch(`${baseUrl}/api/sync/join-ticket/${TICKET}`)).status).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // The People ledger (plan §4a) — the same shelf read back for the owner, with
  // the tickets taken out.
  // ---------------------------------------------------------------------------

  const listLedger = async (farmId = FARM_ID): Promise<JoinTicketLedger> => {
    const res = await fetch(`${baseUrl}/api/sync/join-tickets?farmId=${encodeURIComponent(farmId)}`);
    expect(res.status).toBe(200);
    return (await res.json()) as JoinTicketLedger;
  };

  it('lists a minted ticket as a People row — label, preset and modules included', async () => {
    const preset = findJoinPreset('field_only');
    expect(preset).not.toBeNull();
    await register(
      manifestBody({
        label: 'Dave — spray ute',
        permissions: buildJoinPermissions(preset!),
      }),
    );

    const ledger = await listLedger();
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.shelf).toBeTruthy();

    const [row] = ledger.rows;
    expect(row.label).toBe('Dave — spray ute');
    expect(row.role).toBe('farmer');
    expect(row.preset).toBe('field_only');
    // The join floor (dashboard + settings) rides on top of the preset's list.
    expect(row.modules).toEqual(expect.arrayContaining(['dashboard', 'settings', 'map']));
    expect(row.uses).toBe(0);
    expect(row.lastUsedAt).toBeUndefined();
  });

  it('never lets the ticket itself into the ledger response', async () => {
    // A ticket is a bearer capability; a row is addressed by a random id
    // precisely so listing rows hands over nothing redeemable.
    await register(manifestBody({ label: 'Dave' }));

    const res = await fetch(`${baseUrl}/api/sync/join-tickets?farmId=${FARM_ID}`);
    const raw = await res.text();
    expect(raw).not.toContain(TICKET);

    const { rows } = JSON.parse(raw) as JoinTicketLedger;
    expect(rows[0].id).toBeTruthy();
    expect(rows[0].id).not.toContain(TICKET);
  });

  it('stamps a row when the ticket is looked up, so People can say "last used"', async () => {
    await register(manifestBody());

    await fetch(`${baseUrl}/api/sync/join-ticket/${TICKET}`);
    await fetch(`${baseUrl}/api/sync/join-ticket/${TICKET}`);

    const [row] = (await listLedger()).rows;
    expect(row.uses).toBe(2);
    expect(Date.parse(row.lastUsedAt ?? '')).not.toBeNaN();
  });

  it('scopes the ledger to one farm', async () => {
    await register(manifestBody());
    await register(manifestBody({ farmId: 'someone-elses-farm', ticket: 'PUF-2222-3333' }));

    const rows = (await listLedger()).rows;
    expect(rows).toHaveLength(1);

    expect((await listLedger('someone-elses-farm')).rows).toHaveLength(1);
  });

  it('requires a farmId rather than listing the whole shelf', async () => {
    const res = await fetch(`${baseUrl}/api/sync/join-tickets`);
    expect(res.status).toBe(400);
  });

  it('revokes a row by its id, which kills the ticket underneath', async () => {
    await register(manifestBody());
    const [row] = (await listLedger()).rows;

    const res = await fetch(`${baseUrl}/api/sync/join-tickets/${row.id}`, { method: 'DELETE' });
    expect((await res.json()).revoked).toBe(true);

    expect((await listLedger()).rows).toHaveLength(0);
    expect((await fetch(`${baseUrl}/api/sync/join-ticket/${TICKET}`)).status).toBe(404);
  });

  it('answers revoked:false for an id it has never seen', async () => {
    const res = await fetch(`${baseUrl}/api/sync/join-tickets/not-a-row`, { method: 'DELETE' });
    expect((await res.json()).revoked).toBe(false);
  });

  it('gives a ticket minted before presets existed a readable row', async () => {
    // No permissions bag at all — the pre-§3b wire shape. The row must still
    // name a role and a sensible module list rather than coming back empty.
    await register(manifestBody());

    const [row] = (await listLedger()).rows;
    expect(row.preset).toBeUndefined();
    expect(row.role).toBe('farmer');
    expect(row.modules.length).toBeGreaterThan(0);
  });
});
