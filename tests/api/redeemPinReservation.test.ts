/**
 * `maxUses` used to be advisory.
 *
 * `canRedeemPin` read `useCount` near the top of the handler and the increment
 * landed ninety lines later, after `createUser`, `setCustomUserClaims` and two
 * user writes. Two tablets redeeming the same single-use PIN both passed the
 * check inside that window and both wrote `useCount: 1`.
 *
 * The handler is invoked directly rather than over HTTP on purpose: undici
 * pools one connection per origin, so two `fetch` calls to a test server run
 * end to end one after the other and never overlap — a race test built that way
 * passes against the unfixed code.
 *
 * The Firestore stand-in gives `runTransaction` the one guarantee the fix relies
 * on: callbacks do not interleave and their writes land at commit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { pinDocId } from '../../server/accessPinCrypto.ts';

const PIN = 'ABCD2345';
const FARM_ID = 'farm_1';
const PIN_PATH = `access_pins/${pinDocId(PIN)}`;

const docs = new Map<string, Record<string, unknown>>();
let transactionChain: Promise<unknown> = Promise.resolve();

/** Resolves after `turns` microtask hops, so one handler can be parked mid-flight. */
const yieldTurns = async (turns: number) => {
  for (let i = 0; i < turns; i += 1) await Promise.resolve();
};

function docRef(path: string) {
  return {
    path,
    get: async () => {
      await yieldTurns(2);
      return { exists: docs.has(path), data: () => docs.get(path) };
    },
    set: async (data: Record<string, unknown>) => {
      await yieldTurns(2);
      docs.set(path, { ...(docs.get(path) || {}), ...data });
    },
  };
}

const fakeDb = {
  collection: (name: string) => ({ doc: (id: string) => docRef(`${name}/${id}`) }),
  runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
    const result = transactionChain.then(async () => {
      const writes: Array<[string, Record<string, unknown>]> = [];
      const out = await fn({
        get: (ref: { get: () => Promise<unknown> }) => ref.get(),
        set: (ref: { path: string }, data: Record<string, unknown>) => {
          writes.push([ref.path, data]);
        },
      });
      for (const [path, data] of writes) {
        docs.set(path, { ...(docs.get(path) || {}), ...data });
      }
      return out;
    }) as Promise<T>;
    transactionChain = result.catch(() => undefined);
    return result;
  },
};

const fakeAuth = {
  getUser: vi.fn(async () => {
    throw new Error('no user');
  }),
  createUser: vi.fn(async () => {
    await yieldTurns(4);
    return {};
  }),
  updateUser: vi.fn(async () => ({})),
  setCustomUserClaims: vi.fn(async () => undefined),
  createCustomToken: vi.fn(async () => 'custom-token'),
};

vi.mock('../../server/firebaseAdmin.ts', () => ({
  getAdminAuth: () => fakeAuth,
  getAdminDb: () => fakeDb,
  getAdminFieldValue: () => ({
    increment: (n: number) => ({ __increment: n }),
    delete: () => ({ __delete: true }),
  }),
  isAdminSdkReady: () => true,
}));

const { registerAccessPinMemberRoutes } = await import(
  '../../server/accessPinMemberRoutes.ts'
);

type Handler = (req: unknown, res: unknown) => Promise<unknown>;

const routes = new Map<string, Handler>();
registerAccessPinMemberRoutes({
  post: (path: string, handler: Handler) => routes.set(`POST ${path}`, handler),
  get: (path: string, handler: Handler) => routes.set(`GET ${path}`, handler),
  patch: (path: string, handler: Handler) => routes.set(`PATCH ${path}`, handler),
  delete: (path: string, handler: Handler) => routes.set(`DELETE ${path}`, handler),
  put: (path: string, handler: Handler) => routes.set(`PUT ${path}`, handler),
} as never);

const redeemHandler = routes.get('POST /api/auth/redeem-pin');

function capture() {
  const out: { status: number; body: Record<string, unknown> } = { status: 200, body: {} };
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(body: Record<string, unknown>) {
      out.body = body;
      return res;
    },
  };
  return { out, res };
}

function redeem(displayName: string) {
  const { out, res } = capture();
  const req = {
    body: { pin: PIN, displayName },
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  };
  return redeemHandler(req, res).then(() => out);
}

describe('redeem-pin use reservation', () => {
  beforeEach(() => {
    docs.clear();
    transactionChain = Promise.resolve();
    fakeAuth.createUser.mockClear();
    docs.set(PIN_PATH, {
      farmId: FARM_ID,
      role: 'farmer',
      label: 'Test PIN',
      active: true,
      maxUses: 1,
      useCount: 0,
      expiresAt: null,
      createdBy: 'owner',
      createdAt: new Date().toISOString(),
      modules: ['diary'],
    });
    docs.set(`farms/${FARM_ID}`, { enabledModules: ['diary'] });
  });

  it('spends a single-use PIN exactly once when two devices redeem together', async () => {
    const [first, second] = await Promise.all([
      redeem('Alice Grower'),
      redeem('Bob Grower'),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 403]);

    const refused = first.status === 403 ? first : second;
    expect(refused.body.error).toBe('This invite PIN has already been used. Ask for a new one.');
    expect(docs.get(PIN_PATH)?.useCount).toBe(1);
  });

  it('refuses a PIN that is already spent', async () => {
    docs.set(PIN_PATH, { ...docs.get(PIN_PATH), useCount: 1 });

    const result = await redeem('Carol Grower');
    expect(result.status).toBe(403);
    expect(docs.get(PIN_PATH)?.useCount).toBe(1);
  });

  it('hands the use back when account creation fails after the claim', async () => {
    fakeAuth.createUser.mockRejectedValueOnce(new Error('auth is down'));

    const result = await redeem('Dave Grower');
    expect(result.status).toBe(500);
    // The release is a FieldValue.increment(-1) sentinel through the fake.
    expect(docs.get(PIN_PATH)?.useCount).toEqual({ __increment: -1 });
  });

  it('hands the use back when the farm is gone, which is not a throw', async () => {
    // The reservation is claimed before the farm is looked up, and a deleted
    // farm leaves through a plain `return res.status(404)`. Compensating only
    // in `catch` let that path quietly burn a single-use PIN.
    docs.delete(`farms/${FARM_ID}`);

    const result = await redeem('Erin Grower');
    expect(result.status).toBe(404);
    expect(docs.get(PIN_PATH)?.useCount).toEqual({ __increment: -1 });
  });

  it('keeps the use once a token has actually been handed back', async () => {
    const result = await redeem('Fran Grower');
    expect(result.status).toBe(200);
    expect(docs.get(PIN_PATH)?.useCount).toBe(1);
  });
});

/**
 * An admin PIN is uncapped because redeem is also the return-login path, so
 * `useCount` cannot be what stops a second person using the code. The binding
 * has to be claimed in the same transaction as the use, or two people racing
 * one admin code both read `claimedBy` empty and both become admins.
 */
describe('admin PIN binds to its first redeemer', () => {
  beforeEach(() => {
    docs.clear();
    transactionChain = Promise.resolve();
    fakeAuth.createUser.mockClear();
    docs.set(PIN_PATH, {
      farmId: FARM_ID,
      role: 'admin',
      label: 'Farm admin',
      active: true,
      maxUses: null,
      useCount: 0,
      expiresAt: null,
      createdBy: 'owner',
      createdAt: new Date().toISOString(),
      modules: ['diary'],
    });
    docs.set(`farms/${FARM_ID}`, { enabledModules: ['diary'] });
  });

  it('gives exactly one admin when two people race the same code', async () => {
    const [first, second] = await Promise.all([
      redeem('Alice Grower'),
      redeem('Mallory Grower'),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 403]);

    const winner = first.status === 200 ? 'Alice Grower' : 'Mallory Grower';
    const refused = first.status === 403 ? first : second;
    expect(String(refused.body.error)).toContain('already been used');
    expect(docs.get(PIN_PATH)?.claimedDisplayName).toBe(winner);
  });

  it('still admits the admin who claimed it, so they are not locked out', async () => {
    const first = await redeem('Alice Grower');
    expect(first.status).toBe(200);

    // Same person signing in again on a second device.
    const again = await redeem('Alice Grower');
    expect(again.status).toBe(200);
    expect(docs.get(PIN_PATH)?.claimedDisplayName).toBe('Alice Grower');
  });

  it('turns anyone else away once it is claimed', async () => {
    expect((await redeem('Alice Grower')).status).toBe(200);

    const intruder = await redeem('Mallory Grower');
    expect(intruder.status).toBe(403);
    expect(String(intruder.body.error)).toContain('Alice Grower');
  });

  it('unbinds when the redeem it bound never completed', async () => {
    // Otherwise a failed first attempt would leave the invite claimed by a uid
    // that has no account, and nobody could ever use it.
    fakeAuth.createUser.mockRejectedValueOnce(new Error('auth is down'));

    const failed = await redeem('Alice Grower');
    expect(failed.status).toBe(500);
    expect(docs.get(PIN_PATH)?.claimedBy).toEqual({ __delete: true });
  });
});
