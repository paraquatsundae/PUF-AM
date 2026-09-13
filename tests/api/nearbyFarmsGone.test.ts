/**
 * Public nearby-farm browse is withdrawn (2026-09-13).
 *
 * `GET /api/auth/nearby-farms` used to enumerate `farms_public` with the Admin
 * SDK for any anonymous caller. Join is invite PIN / FarmCode — we do not need
 * the function. Fail closed: 410, no farm list, no Firestore work.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';

import { createApiApp } from '../../server/createApiApp.ts';

async function listen(app: ReturnType<typeof createApiApp>) {
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('Failed to bind test server');
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

function close(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

describe('nearby farm discovery is withdrawn', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    ({ server, baseUrl } = await listen(createApiApp({ surface: 'cloud' })));
  });

  afterAll(() => close(server));

  it('GET /api/auth/nearby-farms is 410 with no farm list', async () => {
    const res = await fetch(`${baseUrl}/api/auth/nearby-farms?lat=-31.95&lng=115.86&radiusKm=5`);
    expect(res.status).toBe(410);
    const body = (await res.json()) as { farms?: unknown; error?: string };
    expect(body.farms).toBeUndefined();
    expect(body.error).toMatch(/withdrawn/i);
    // 503 would mean we still touched Firebase Admin. 429 would be rate-limit-only.
    expect(res.status).not.toBe(503);
    expect(res.status).not.toBe(429);
  });

  it('POST /api/auth/update-farm-discovery is 410 and does not enumerate', async () => {
    const res = await fetch(`${baseUrl}/api/auth/update-farm-discovery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: -31.95, lng: 115.86, showNearby: true }),
    });
    expect(res.status).toBe(410);
    const body = (await res.json()) as { ok?: boolean; farms?: unknown; error?: string };
    expect(body.ok).toBeUndefined();
    expect(body.farms).toBeUndefined();
    expect(body.error).toMatch(/withdrawn/i);
  });
});
