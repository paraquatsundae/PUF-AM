/**
 * The desktop LAN listener, end to end against a real bound port.
 *
 * The thing worth testing here is not the middleware in isolation — that is
 * `tests/lanHubAuth.test.ts` — but that a tablet's actual sequence works: probe,
 * read the handshake, pair once, then reach the sync routes and nothing else.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { startLanApi, type LanApiHandle } from '../../desktop/lanApi.ts';
import { mintPairingCode, type LanHubDevice } from '../../desktop/lanHubAuth.ts';
import { resetJoinManifestsForTest } from '../../server/joinManifestStore.ts';
import type { HubInfo } from '../../shared/sync/hubInfo.ts';

const CODE = mintPairingCode();

let handle: LanApiHandle;
let base: string;
let devices: LanHubDevice[] = [];
let seen: string[] = [];

/**
 * One listener for the whole file, with the mutable state reset per test.
 *
 * Binding and closing per test made this suite flaky: `fetch` keeps the
 * connection alive, and when the OS handed the next `port: 0` bind the port a
 * closed server had just released, the pooled socket was reused against a
 * listener that no longer existed. `undici` retries an idempotent GET on a
 * stale socket but not a POST, so whichever test happened to start with
 * `/api/hub/pair` failed — a different one most runs.
 */
beforeAll(async () => {
  handle = await startLanApi({
    // 127.0.0.1 in tests: binding 0.0.0.0 on a developer box invites a firewall
    // prompt, and the guard does not care which interface the request arrived on.
    host: '127.0.0.1',
    port: 0,
    pairingCode: () => CODE,
    devices: () => devices,
    onPaired: (device) => devices.push(device),
    onDeviceSeen: (id) => seen.push(id),
    cloudApiBase: () => 'https://am.pufworks.farm',
    freenetReady: () => true,
  });
  base = `http://127.0.0.1:${handle.port}`;
});

beforeEach(() => {
  resetJoinManifestsForTest();
  devices = [];
  seen = [];
});

afterAll(async () => {
  await handle.close();
});

async function pair(code: string, deviceName = 'Shed tablet') {
  const res = await fetch(`${base}/api/hub/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, deviceName }),
  });
  return { res, body: (await res.json()) as Record<string, unknown> };
}

describe('desktop LAN hub listener', () => {
  it('answers liveness without a credential, so discovery can probe it', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('describes itself as a pairing hub that defers the cloud-only families', async () => {
    const res = await fetch(`${base}/api/hub/info`);
    const info = (await res.json()) as HubInfo;
    expect(info.product).toBe('PUF-AM');
    expect(info.kind).toBe('desktop-lan');
    expect(info.pairingRequired).toBe(true);
    expect(info.paired).toBe(false);
    expect(info.cloudOnlyPrefixes).toContain('/api/auth/');
    expect(info.cloudOnlyPrefixes).toContain('/api/weather/');
    expect(info.cloudApiBase).toBe('https://am.pufworks.farm');
    expect(info.freenet).toBe(true);
  });

  it('401s a sync route until the device has paired', async () => {
    const res = await fetch(`${base}/api/sync/self`);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { pairingRequired?: boolean; error?: string };
    expect(body.pairingRequired).toBe(true);
    expect(body.error).toMatch(/pairing code/i);
  });

  it('exchanges the pairing code for a device token, once', async () => {
    const { res, body } = await pair(CODE);
    expect(res.status).toBe(200);
    expect(String(body.token)).toMatch(/^[0-9a-f]{64}$/);
    expect(body.deviceName).toBe('Shed tablet');
    expect((body.hub as HubInfo).paired).toBe(true);
    expect(devices).toHaveLength(1);
    // The token itself is never handed to the persistence layer.
    expect(devices[0].tokenHash).not.toBe(body.token);
  });

  it('accepts the code as the operator typed it', async () => {
    const { res } = await pair(CODE.replace('-', '').toLowerCase());
    expect(res.status).toBe(200);
  });

  it('rejects a wrong code and pairs nothing', async () => {
    const { res, body } = await pair('AAAA-AAAA');
    expect(res.status).toBe(401);
    expect(String(body.error)).toMatch(/does not match/i);
    expect(devices).toHaveLength(0);
  });

  it('lets a paired device reach the sync routes and records that it was seen', async () => {
    const { body } = await pair(CODE);
    const token = String(body.token);

    const res = await fetch(`${base}/api/sync/self`, {
      headers: { 'x-puf-hub-token': token },
    });
    expect(res.status).toBe(200);
    expect(seen).toEqual([devices[0].id]);

    // A bearer works too, for a curl from the workshop.
    const bearer = await fetch(`${base}/api/sync/self`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(bearer.status).toBe(200);
  });

  it('carries a join ticket from register to resolve for a paired tablet', async () => {
    const { body } = await pair(CODE);
    const auth = { 'x-puf-hub-token': String(body.token) };
    const ticket = 'PUF-K7M2-9Q4X';

    const registered = await fetch(`${base}/api/sync/join-ticket`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        v: 2,
        farmId: 'farm-abc',
        hotUri: 'FN02@hot',
        bonesUri: 'FN02@bones',
        role: 'farmer',
        ticket,
      }),
    });
    expect(registered.status).toBe(200);

    const resolved = await fetch(
      `${base}/api/sync/join-ticket/${ticket}/resolve?farmId=farm-abc`,
      { headers: auth },
    );
    expect(resolved.status).toBe(200);
    const payload = (await resolved.json()) as { manifest: { hotUri: string }; resolvedFrom: string };
    expect(payload.manifest.hotUri).toBe('FN02@hot');
    expect(payload.resolvedFrom).toBe('self');
  });

  it('does not serve sign-in or weather even to a paired device', async () => {
    const { body } = await pair(CODE);
    const auth = { 'x-puf-hub-token': String(body.token) };

    for (const path of ['/api/auth/pins', '/api/weather/chill-portions']) {
      const res = await fetch(`${base}${path}`, { headers: auth });
      expect(res.status).toBe(404);
      expect(String(((await res.json()) as { error: string }).error)).toMatch(/local network/i);
    }
  });

  it('does not serve the built UI over the LAN', async () => {
    const { body } = await pair(CODE);
    const res = await fetch(`${base}/`, { headers: { 'x-puf-hub-token': String(body.token) } });
    expect(res.status).toBe(404);
  });

  it('stops honouring a token once the operator removes the device', async () => {
    const { body } = await pair(CODE);
    const auth = { 'x-puf-hub-token': String(body.token) };
    expect((await fetch(`${base}/api/sync/self`, { headers: auth })).status).toBe(200);

    devices = [];
    expect((await fetch(`${base}/api/sync/self`, { headers: auth })).status).toBe(401);
  });

  it('advertises the hub token in the CORS allow-list, so the APK can send it', async () => {
    const res = await fetch(`${base}/api/sync/self`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://localhost' },
    });
    expect(res.headers.get('access-control-allow-headers')).toContain('x-puf-hub-token');
    expect(res.headers.get('access-control-allow-origin')).toBe('https://localhost');
  });
});
