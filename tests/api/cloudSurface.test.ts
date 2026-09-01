/**
 * What the public API is allowed to be — `server/apiSurface.ts`.
 *
 * Every route asserted absent here was live on `am.pufworks.farm` and found by a
 * pen test: an unauthenticated 64 MB write shelf, an mDNS browse answering with
 * `localhost` and `169.254.9.1`, a Freenet family closed only by an env var
 * remembering to be set, and a hub handshake announcing production as
 * `kind: 'workshop-dev'` with the machine's hostname attached.
 *
 * The reason to test the absence rather than trust the diff: the previous state
 * was not a decision anybody made, it was `createApiApp()` growing a route for
 * `npm run dev` and Cloud Run inheriting it. Without a test the next such route
 * arrives the same way.
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

describe('cloud API surface', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    ({ server, baseUrl } = await listen(createApiApp({ surface: 'cloud' })));
  });

  afterAll(() => close(server));

  it('defaults to the cloud surface when no surface is named', async () => {
    const { server: defaulted, baseUrl: defaultedUrl } = await listen(createApiApp());
    try {
      // Fail-closed: a caller that forgets gets the smaller surface, so the
      // failure mode is a 404 on a LAN route rather than an open shelf.
      const res = await fetch(`${defaultedUrl}/api/hub/info`);
      expect(res.status).toBe(404);
    } finally {
      await close(defaulted);
    }
  });

  describe('LAN families are absent', () => {
    const gone: Array<[string, string]> = [
      // Announced production as a workshop dev box and leaked the hostname.
      ['GET', '/api/hub/info'],
      // Answered with this instance's link-local addresses.
      ['GET', '/api/sync/self'],
      ['GET', '/api/sync/peers'],
      // Unauthenticated write shelf into this process's memory.
      ['GET', '/api/sync/mist/farm-probe'],
      ['POST', '/api/sync/mist/farm-probe'],
      ['GET', '/api/sync/mist/farm-probe/meta'],
      // Unauthenticated family, previously closed only by MIST_FREENET_DISABLED.
      ['GET', '/api/mist/freenet/status'],
      ['POST', '/api/mist/freenet/put'],
      // Join tickets are a LAN handshake.
      ['GET', '/api/join/tickets'],
    ];

    for (const [method, path] of gone) {
      it(`${method} ${path} is 404`, async () => {
        const res = await fetch(`${baseUrl}${path}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: method === 'POST' ? '{}' : undefined,
        });
        expect(res.status).toBe(404);
      });
    }
  });

  describe('the surface the web app needs is intact', () => {
    it('GET /api/health answers', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      expect(res.status).toBe(200);
    });

    /**
     * 401 or 503, never 404: the route has to exist to refuse anyone. 503 is a
     * tree without Firebase Admin credentials, which is most CI checkouts.
     */
    it('/api/admin/ops exists and refuses an anonymous caller', async () => {
      const res = await fetch(`${baseUrl}/api/admin/ops`);
      expect(res.status).not.toBe(404);
      expect([400, 401, 403, 429, 503]).toContain(res.status);
    });

    /**
     * Deliberately an *unlisted* DPIRD path. Both a missing family and an unknown
     * path answer 404, so the status alone proves nothing — but the bodies
     * differ, and the allowlist check runs before authentication. That makes this
     * both a sharper assertion and a much cheaper one: it never reaches
     * `requireAuthedUser`, so it does not drag in the `firebase-admin` import.
     */
    it('the weather family is mounted', async () => {
      const res = await fetch(`${baseUrl}/api/weather/dpird/not-a-real-path`);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe('Unknown DPIRD path');
      expect(body.error).not.toBe('API route not found');
    });

    it('GET /api/plugins/packages answers', async () => {
      const res = await fetch(`${baseUrl}/api/plugins/packages`);
      expect(res.status).not.toBe(404);
    });

    it('the tile proxy is registered', async () => {
      // Bad coordinates, so this asserts routing without reaching Landgate.
      const res = await fetch(`${baseUrl}/api/tiles/99/0/0`);
      expect(res.status).toBe(400);
    });
  });
});

describe('hub API surface', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    ({ server, baseUrl } = await listen(createApiApp({ surface: 'hub' })));
  });

  afterAll(() => close(server));

  it('still serves the hub handshake', async () => {
    const res = await fetch(`${baseUrl}/api/hub/info`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ product: 'PUF-AM', kind: 'workshop-dev' });
  });

  it('still serves mDNS self-description', async () => {
    const res = await fetch(`${baseUrl}/api/sync/self`);
    expect(res.status).toBe(200);
  });

  it('still serves the sealed mist shelf', async () => {
    // 404 here is "nothing on the shelf for that farm", which is the route
    // answering. A missing route would be the JSON 404 from the /api catch-all.
    const res = await fetch(`${baseUrl}/api/sync/mist/farm-probe/meta`);
    const body = (await res.json()) as { error?: string };
    expect(body.error).not.toBe('API route not found');
  });
});
