/**
 * Cloud Run `/api/tiles/**` spends this project's instances and Landgate's
 * export quota, so an anonymous caller must not get a JPEG.
 *
 * The route was open because Leaflet fetches tiles as `<img src>` and cannot
 * carry a header. The web client now loads tiles through `apiFetch` (which
 * attaches the Firebase bearer). Hub / desktop copies of the route stay open
 * on purpose — those surfaces have no Admin SDK and still serve `<img src>`.
 *
 * Refusal is 401 with Firebase Admin credentials present and 503 without, so a
 * checkout with no `secrets/` still runs these. Both mean "did not reach the
 * upstream", which is the property under test.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';

const verifyIdToken = vi.fn();
const userDocGet = vi.fn();

vi.mock('../../server/firebaseAdmin.ts', () => ({
  getAdminApp: () => ({}),
  getAdminAuth: () => ({ verifyIdToken }),
  getAdminDb: () => ({
    collection: () => ({ doc: () => ({ get: userDocGet }) }),
    doc: () => ({ get: userDocGet, set: vi.fn(), update: vi.fn() }),
  }),
  getAdminFieldValue: () => ({ increment: (n: number) => n }),
  isAdminSdkReady: () => true,
}));

const { createApiApp } = await import('../../server/createApiApp.ts');
const { resetTileProxyForTests } = await import('../../server/tileProxyRoutes.ts');
const { resetTileCallerForTests } = await import('../../server/requireTileCaller.ts');

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const PERTH = '/api/tiles/12/3366/2431';

let server: Server;
let baseUrl: string;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  const app = createApiApp({ surface: 'cloud' });
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('Failed to bind test server');
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

beforeEach(() => {
  verifyIdToken.mockReset();
  userDocGet.mockReset();
  userDocGet.mockResolvedValue({ exists: false, data: () => null });
  resetTileCallerForTests();
  resetTileProxyForTests();

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('services.slip.wa.gov.au') || url.includes('/export')) {
      return new Response(JPEG, {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      });
    }
    return realFetch(input, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

function authed(path: string, token = 'member-token') {
  return fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

describe('cloud tile proxy auth', () => {
  it('refuses an anonymous caller', async () => {
    const res = await fetch(`${baseUrl}${PERTH}`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Missing Authorization bearer token' });
    expect(res.headers.get('content-type')).toMatch(/json/);
  });

  it('refuses a bearer that does not verify', async () => {
    verifyIdToken.mockRejectedValue(new Error('token expired'));
    const res = await authed(PERTH, 'stale');
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toMatch(/token expired|Not authorised/);
  });

  it('refuses a signed-in account that belongs to no farm', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'google_stranger' });
    const res = await authed(PERTH);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'This account is not a member of a farm.' });
  });

  it('serves a JPEG to a member whose token carries the farm claim', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'member_claim', farmId: 'farm_1', role: 'farmer' });
    const res = await authed(PERTH);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/image\/jpeg/);
    expect(res.headers.get('x-tile-cache')).toBe('miss');
    expect(res.headers.get('cache-control')).toMatch(/private/);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  });

  it('serves a cache hit only after the bearer is checked', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'member_claim', farmId: 'farm_1', role: 'farmer' });
    const miss = await authed(PERTH);
    expect(miss.status).toBe(200);
    expect(miss.headers.get('x-tile-cache')).toBe('miss');

    const hit = await authed(PERTH);
    expect(hit.status).toBe(200);
    expect(hit.headers.get('x-tile-cache')).toBe('hit');

    const anon = await fetch(`${baseUrl}${PERTH}`);
    expect(anon.status).toBe(401);
  });

  it('admits a member known only by the stored user record', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'member_stored' });
    userDocGet.mockResolvedValue({ exists: true, data: () => ({ farmId: 'farm_1' }) });
    const res = await authed(PERTH);
    expect(res.status).toBe(200);
  });

  it('admits a platform admin, who has no farm of their own', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'ops', platformAdmin: true });
    const res = await authed(PERTH);
    expect(res.status).toBe(200);
  });

  it('400s a bad tile after the bearer is accepted, without reaching the upstream', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'member_claim', farmId: 'farm_1' });
    const res = await authed('/api/tiles/99/0/0');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/Zoom/);
  });
});

describe('weather family is unchanged beside the tile gate', () => {
  it('still refuses an anonymous weather caller', async () => {
    const res = await fetch(`${baseUrl}/api/weather/dpird/stations?limit=5`);
    expect(res.status).toBe(401);
  });
});
