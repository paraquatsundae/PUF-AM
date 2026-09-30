import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApiApp } from '../../server/createApiApp.ts';

describe('directed notify routes', () => {
  let server: Server;
  let baseUrl: string;

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

  it('refuses an anonymous notify', async () => {
    const res = await fetch(`${baseUrl}/api/auth/notify-directed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUid: 'someone', note: 'Check this' }),
    });
    expect([401, 503]).toContain(res.status);
  });

  it('refuses an anonymous permission change', async () => {
    const res = await fetch(`${baseUrl}/api/auth/notify-permission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: 'someone', allowed: true }),
    });
    expect([401, 503]).toContain(res.status);
  });
});
