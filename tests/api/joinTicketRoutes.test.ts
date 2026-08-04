import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';

import { registerJoinTicketRoutes } from '../../server/joinTicketRoutes.ts';
import { resetJoinManifestsForTest } from '../../server/joinManifestStore.ts';

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

  it('tells a joiner to get on the owner Wi-Fi when nothing can answer', async () => {
    const res = await fetch(`${baseUrl}/api/sync/join-ticket/${TICKET}/resolve`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain('same Wi‑Fi as the farm owner');
  });

  it('revokes a ticket so a re-send invalidates the old one', async () => {
    await register(manifestBody());

    const deleted = await fetch(`${baseUrl}/api/sync/join-ticket/${TICKET}`, { method: 'DELETE' });
    expect((await deleted.json()).revoked).toBe(true);
    expect((await fetch(`${baseUrl}/api/sync/join-ticket/${TICKET}`)).status).toBe(404);
  });
});
