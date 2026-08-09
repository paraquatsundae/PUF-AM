/**
 * The Wi‑Fi shelf a Freenet farm uses — `server/mistLanShelfRoutes.ts`.
 *
 * The route is deliberately not per-farm authenticated (the body is sealed with
 * the FarmSeed before it arrives), so what there is to check is that it stores
 * opaque bytes faithfully, reports the digest a peer compares against, and is
 * honest about holding nothing.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §9
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';

import {
  MIST_SHELF_DEVICE_HEADER,
  MIST_SHELF_HASH_HEADER,
  registerMistLanShelfRoutes,
  resetMistLanShelfForTests,
} from '../../server/mistLanShelfRoutes.ts';

/** Unique per run so a leftover `tmp/lan-sync/mist` file cannot answer for us. */
const FARM_ID = `farm-shelf-${Math.random().toString(36).slice(2, 10)}`;
const SEALED = new Uint8Array([0x7b, 0x22, 0x76, 0x22, 0x00, 0xff, 0x10]);

describe('sealed LAN shelf routes', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    registerMistLanShelfRoutes(app);
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
    resetMistLanShelfForTests();
  });

  const push = (bytes: Uint8Array, headers: Record<string, string>) =>
    fetch(`${baseUrl}/api/sync/mist/${FARM_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', ...headers },
      body: bytes,
    });

  it('hands back exactly the bytes it was given', async () => {
    // Opaque on purpose: the hub cannot open this and must not reshape it.
    const posted = await push(SEALED, {
      [MIST_SHELF_HASH_HEADER]: 'digest-1',
      [MIST_SHELF_DEVICE_HEADER]: 'Shed laptop',
    });
    expect(posted.status).toBe(200);

    const got = await fetch(`${baseUrl}/api/sync/mist/${FARM_ID}`);
    expect(got.status).toBe(200);
    expect(got.headers.get(MIST_SHELF_HASH_HEADER)).toBe('digest-1');
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(SEALED);
  });

  it('reports the digest without moving the farm', async () => {
    // This is the request an idle device makes every few minutes; it must be
    // able to decide "already current" without downloading anything.
    await push(SEALED, {
      [MIST_SHELF_HASH_HEADER]: 'digest-1',
      [MIST_SHELF_DEVICE_HEADER]: 'Shed laptop',
    });
    const meta = await fetch(`${baseUrl}/api/sync/mist/${FARM_ID}/meta`);
    expect(meta.status).toBe(200);
    expect(await meta.json()).toMatchObject({
      farmId: FARM_ID,
      contentHash: 'digest-1',
      deviceLabel: 'Shed laptop',
      bytes: SEALED.length,
    });
  });

  it('replaces what it holds when a peer pushes again', async () => {
    await push(SEALED, { [MIST_SHELF_HASH_HEADER]: 'digest-1' });
    const next = new Uint8Array([1, 2, 3]);
    await push(next, { [MIST_SHELF_HASH_HEADER]: 'digest-2' });

    const got = await fetch(`${baseUrl}/api/sync/mist/${FARM_ID}`);
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(next);
    expect(got.headers.get(MIST_SHELF_HASH_HEADER)).toBe('digest-2');
  });

  it('404s for a farm it has never been given', async () => {
    // Distinct from an error: it is what a first device sees, and it means
    // "push, do not wait".
    const got = await fetch(`${baseUrl}/api/sync/mist/farm-nobody-pushed/meta`);
    expect(got.status).toBe(404);
  });

  it('refuses a push with no digest, rather than storing an unusable blob', async () => {
    const posted = await push(SEALED, {});
    expect(posted.status).toBe(400);
  });

  it('refuses an empty body', async () => {
    const posted = await push(new Uint8Array(), { [MIST_SHELF_HASH_HEADER]: 'digest-1' });
    expect(posted.status).toBe(400);
  });
});
