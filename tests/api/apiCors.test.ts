/**
 * CORS on the API — `apiCorsMiddleware()` in `server/createApiApp.ts`.
 *
 * The middleware used to default to `Access-Control-Allow-Origin: *` for any
 * origin it did not recognise, preflight included. With no `Allow-Credentials`
 * and bearer auth that is not session-riding, but it did let any page on the
 * internet read every unauthenticated response — and the wildcard bought
 * nothing, because same-origin traffic never consults CORS at all.
 *
 * The other half is the localhost reflection. A tablet talking to a shed laptop
 * genuinely needs `capacitor://localhost` and loopback origins allowed; Cloud Run
 * never does, and allowing them there hands a read to any page an attacker can
 * get running on a victim's own machine.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';

import { createApiApp } from '../../server/createApiApp.ts';
import type { ApiSurface } from '../../server/apiSurface.ts';

const servers: Record<string, { server: Server; baseUrl: string }> = {};

async function start(surface: ApiSurface) {
  const app = createApiApp({ surface });
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('Failed to bind test server');
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

/** The header the browser actually gates on, or null when absent. */
async function allowOrigin(
  surface: 'cloud' | 'hub',
  origin: string,
  method: 'GET' | 'OPTIONS' = 'GET'
): Promise<string | null> {
  const res = await fetch(`${servers[surface].baseUrl}/api/health`, {
    method,
    headers: { Origin: origin },
  });
  return res.headers.get('access-control-allow-origin');
}

describe('API CORS', () => {
  beforeAll(async () => {
    servers.cloud = await start('cloud');
    servers.hub = await start('hub');
  });

  afterAll(async () => {
    for (const { server } of Object.values(servers)) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  describe('an unknown origin gets no header at all', () => {
    it.each(['cloud', 'hub'] as const)('on the %s surface', async (surface) => {
      expect(await allowOrigin(surface, 'https://evil.example')).toBeNull();
    });

    it('including on a preflight', async () => {
      expect(await allowOrigin('cloud', 'https://evil.example', 'OPTIONS')).toBeNull();
    });

    it('never as a wildcard, which is what it used to be', async () => {
      expect(await allowOrigin('cloud', 'https://evil.example')).not.toBe('*');
      expect(await allowOrigin('cloud', 'https://evil.example', 'OPTIONS')).not.toBe('*');
    });
  });

  it('still 204s a preflight it does not recognise', async () => {
    // Without the CORS headers the browser blocks the real request anyway; the
    // 204 just keeps OPTIONS away from the route handlers.
    const res = await fetch(`${servers.cloud.baseUrl}/api/health`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example' },
    });
    expect(res.status).toBe(204);
  });

  it('reflects the production origin on both surfaces', async () => {
    for (const surface of ['cloud', 'hub'] as const) {
      expect(await allowOrigin(surface, 'https://am.pufworks.farm')).toBe(
        'https://am.pufworks.farm'
      );
    }
  });

  it('varies on Origin so a shared cache cannot cross-serve', async () => {
    const res = await fetch(`${servers.cloud.baseUrl}/api/health`, {
      headers: { Origin: 'https://am.pufworks.farm' },
    });
    expect(res.headers.get('vary')).toBe('Origin');
  });

  describe('LAN client origins', () => {
    const lanOrigins = [
      'capacitor://localhost',
      'https://localhost',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
    ];

    it.each(lanOrigins)('%s is reflected on the hub surface', async (origin) => {
      expect(await allowOrigin('hub', origin)).toBe(origin);
    });

    it.each(lanOrigins)('%s is refused on the cloud surface', async (origin) => {
      expect(await allowOrigin('cloud', origin)).toBeNull();
    });
  });

  describe('ALLOWED_ORIGINS', () => {
    let restore: string | undefined;
    let scoped: { server: Server; baseUrl: string };

    beforeEach(() => {
      restore = process.env.ALLOWED_ORIGINS;
    });

    afterEach(async () => {
      if (restore === undefined) delete process.env.ALLOWED_ORIGINS;
      else process.env.ALLOWED_ORIGINS = restore;
      if (scoped) {
        await new Promise<void>((resolve, reject) => {
          scoped.server.close((err) => (err ? reject(err) : resolve()));
        });
      }
    });

    it('replaces the built-in list rather than adding to it', async () => {
      process.env.ALLOWED_ORIGINS = 'https://farm.example, https://second.example';
      scoped = await start('cloud');

      const ask = async (origin: string) => {
        const res = await fetch(`${scoped.baseUrl}/api/health`, { headers: { Origin: origin } });
        return res.headers.get('access-control-allow-origin');
      };

      expect(await ask('https://farm.example')).toBe('https://farm.example');
      expect(await ask('https://second.example')).toBe('https://second.example');
      // Narrowing has to be possible too, not just widening.
      expect(await ask('https://am.pufworks.farm')).toBeNull();
    });
  });
});
