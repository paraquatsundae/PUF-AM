/**
 * A verified token is not the bar for `/api/weather/*` — membership of a farm
 * is.
 *
 * The two came apart because Google sign-in is open to any Google account and
 * `verifyBearer` is content with a token carrying no `farmId`, so anyone who
 * read the public Firebase key out of the client bundle could sign in and
 * spend this server's DPIRD key. `weatherRouteAuth.test.ts` covers the
 * anonymous case; this file covers the authenticated stranger, which is the
 * one that looked legitimate.
 *
 * Assertions are "not 403" rather than "200" for the callers who should get
 * through: a checkout with no `DPIRD_API_KEY` answers 503 further down, and it
 * is the gate under test here, not the upstream call.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
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

let server: Server;
let baseUrl: string;

beforeEach(() => {
  verifyIdToken.mockReset();
  userDocGet.mockReset();
  // Nothing stored unless a test says otherwise. `verifyBearer` reads this doc
  // for revocation, and the membership fallback reads it again.
  userDocGet.mockResolvedValue({ exists: false, data: () => null });
});

beforeAll(async () => {
  const app = createApiApp();
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

/** Every route in the family, so a new one cannot quietly skip the gate. */
const WEATHER_ROUTES: Array<{ label: string; call: (token: string) => Promise<Response> }> = [
  {
    label: 'GET /api/weather/dpird/stations',
    call: (token) =>
      fetch(`${baseUrl}/api/weather/dpird/stations?limit=5`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
  },
  {
    label: 'GET /api/weather/chill-portions',
    call: (token) =>
      fetch(`${baseUrl}/api/weather/chill-portions?stationCode=MA002`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
  },
  {
    label: 'POST /api/weather/ensure-cache',
    call: (token) =>
      fetch(`${baseUrl}/api/weather/ensure-cache`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationCode: 'MA002' }),
      }),
  },
  {
    label: 'POST /api/weather/ensure-forecast',
    call: (token) =>
      fetch(`${baseUrl}/api/weather/ensure-forecast`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationCode: 'MA002' }),
      }),
  },
  {
    label: 'POST /api/weather/blight-risk',
    call: (token) =>
      fetch(`${baseUrl}/api/weather/blight-risk`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: -33.9, lng: 116.1 }),
      }),
  },
];

describe('weather route membership', () => {
  it('refuses a signed-in account that belongs to no farm', async () => {
    // What a bare Google sign-in produces: a real uid, no custom claims.
    verifyIdToken.mockResolvedValue({ uid: 'google_stranger' });

    for (const route of WEATHER_ROUTES) {
      const res = await route.call('t');
      expect(res.status, `${route.label} answered ${res.status}`).toBe(403);
      expect(await res.json()).toEqual({ error: 'This account is not a member of a farm.' });
    }
  });

  it('admits a member whose token carries the farm claim', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'member_claim', farmId: 'farm_1', role: 'farmer' });

    for (const route of WEATHER_ROUTES) {
      const res = await route.call('t');
      expect(res.status, `${route.label} answered ${res.status}`).not.toBe(403);
    }
  });

  /**
   * The claim is only a cache of the stored record, so an account added before
   * its current token was minted still has to get through.
   */
  it('admits a member known only by the stored user record', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'member_stored' });
    userDocGet.mockResolvedValue({ exists: true, data: () => ({ farmId: 'farm_1' }) });

    const res = await WEATHER_ROUTES[0].call('t');
    expect(res.status).not.toBe(403);
  });

  it('admits a platform admin, who has no farm of their own', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'ops', platformAdmin: true });

    const res = await WEATHER_ROUTES[0].call('t');
    expect(res.status).not.toBe(403);
  });

  /**
   * An empty string is a farmId-shaped value that is not a farm. Left
   * unchecked it would read as truthy membership on the stored path.
   */
  it('does not treat an empty stored farmId as membership', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'member_blank' });
    userDocGet.mockResolvedValue({ exists: true, data: () => ({ farmId: '' }) });

    const res = await WEATHER_ROUTES[0].call('t');
    expect(res.status).toBe(403);
  });
});

describe('weather route budget', () => {
  /**
   * The budget is shared across the family rather than held per route, so
   * spending it on one path closes the others too. Without that, a caller
   * could take each route's allowance in turn against the same DPIRD key.
   */
  it('runs out across routes, not per route', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'burner', farmId: 'farm_1', role: 'farmer' });

    const { WEATHER_MAX_CALLS } = await import('../../server/requireWeatherCaller.ts');

    let sawLimit = false;
    for (let i = 0; i < WEATHER_MAX_CALLS + 1; i += 1) {
      // Rotating routes: a per-route budget would never trip inside this many.
      const route = WEATHER_ROUTES[i % WEATHER_ROUTES.length];
      const res = await route.call('t');
      if (res.status === 429) {
        sawLimit = true;
        break;
      }
    }

    expect(sawLimit).toBe(true);
  });
});
