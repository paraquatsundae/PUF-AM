/**
 * The wrapper's ordering is the thing worth testing: guard before the API app,
 * static after it. Getting that wrong is silent — the app keeps working for the
 * renderer while `/api/*` stays open to every other process on the machine.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startLocalApi, type LocalApiHandle } from './localApi.ts';
import { LOOPBACK_TOKEN_HEADER } from './loopbackAuth.ts';

const TOKEN = 'f'.repeat(64);

let distPath: string;
let api: LocalApiHandle;

beforeAll(async () => {
  distPath = mkdtempSync(path.join(tmpdir(), 'pufam-dist-'));
  writeFileSync(path.join(distPath, 'index.html'), '<!doctype html><title>PUF-AM</title>', 'utf8');
  api = await startLocalApi({ distPath, authToken: TOKEN });
});

afterAll(async () => {
  await api.close();
  rmSync(distPath, { recursive: true, force: true });
});

describe('desktop loopback API', () => {
  it('binds loopback only', () => {
    expect(api.url.startsWith('http://127.0.0.1:')).toBe(true);
  });

  it('serves the SPA without a token', async () => {
    const res = await fetch(`${api.url}/settings`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('PUF-AM');
  });

  it('401s an untokened /api/* caller', async () => {
    const res = await fetch(`${api.url}/api/mist/freenet/status`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'PUF-AM desktop loopback token required' });
  });

  it('passes a tokened caller through to the real routes', async () => {
    const res = await fetch(`${api.url}/api/definitely-not-a-route`, {
      headers: { [LOOPBACK_TOKEN_HEADER]: TOKEN },
    });
    // The API app's own JSON 404 — proof the guard handed off rather than
    // shadowing, and that static did not swallow the path.
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'API route not found' });
  });

  it('keeps /api/health reachable for the smoke check', async () => {
    const res = await fetch(`${api.url}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  /**
   * The port is the renderer's storage origin (`localApiPort.ts`), so the two
   * behaviours that keep an operator's farm reachable are: bind the saved port
   * when it is free, and *walk* — not fall back to an ephemeral port — when it
   * is not, reporting what was actually bound so `main.ts` can save it.
   */
  it('binds the saved port when it is free', async () => {
    const second = await startLocalApi({ distPath, authToken: TOKEN, port: api.port + 100 });
    try {
      expect(second.port).toBe(api.port + 100);
      expect(second.url).toBe(`http://127.0.0.1:${api.port + 100}`);
    } finally {
      await second.close();
    }
  });

  it('walks upward off a taken port rather than jumping to an ephemeral one', async () => {
    // `api` already holds its port, so asking for the same one must resolve to
    // a nearby port — a new empty storage bucket at random is the old bug.
    const second = await startLocalApi({ distPath, authToken: TOKEN, port: api.port });
    try {
      expect(second.port).toBeGreaterThan(api.port);
      expect(second.port).toBeLessThanOrEqual(api.port + 20);
    } finally {
      await second.close();
    }
  });
});
