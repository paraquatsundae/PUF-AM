/**
 * Loopback API + static host for the Electron shell.
 *
 * The renderer is served from the *same* origin as `/api/*`, so `getApiBaseUrl()`
 * stays same-origin and no CORS or CSP special-casing is needed. Binds
 * `127.0.0.1` — never `0.0.0.0` (today's `npm run dev` does, which is strictly
 * worse).
 *
 * **The port is stable across launches, and that is load-bearing.** It used to
 * be ephemeral, which made the renderer's origin `http://127.0.0.1:<new port>`
 * every launch — and Chromium partitions `localStorage` and IndexedDB *by
 * origin*. Every AppImage launch therefore opened a brand-new, empty storage
 * bucket: the mist device session, the storage-backend preference and the whole
 * IndexedDB farm were still on disk under the previous launch's origin and
 * unreachable from the new one. That is why the operator who *created* the farm
 * was asked for a FarmCode and a join ticket every single time. The port now
 * comes from `desktop-prefs.json` and is written back after binding, so the
 * origin is the same tomorrow as it was today.
 *
 * Loopback is not the trust boundary; the per-launch token is
 * (`loopbackAuth.ts`, plan §6.3). The guard wraps `createApiApp()` from outside
 * rather than being added to it, so the web server and the tests keep the app
 * they already have.
 */

import type { AddressInfo, Server } from 'node:net';
import path from 'node:path';

import express from 'express';

import { createApiApp } from '../server/createApiApp.ts';
import { createLoopbackAuthGuard } from './loopbackAuth.ts';
import { APP_LOCAL_PORT_ATTEMPTS, APP_LOCAL_PORT_DEFAULT } from './localApiPort.ts';

export type LocalApiHandle = {
  url: string;
  port: number;
  close(): Promise<void>;
};

export type LocalApiOptions = {
  /** Built Vite bundle to serve (packaged: inside app resources). */
  distPath: string;
  host?: string;
  /** Required on `/api/*`; `main.ts` mints one per launch and injects it per request. */
  authToken: string;
  /**
   * Port to bind, from the saved prefs. The listener walks upwards if it is
   * taken and reports what it got, so `main.ts` can persist the real one.
   */
  port?: number;
};

/**
 * Bind the first free port at or above `preferred`.
 *
 * Walking rather than failing, because a stale process on the saved port must
 * not stop the app opening — and walking rather than falling back to port 0,
 * because the whole point is an origin that is still there next launch. The
 * caller persists whatever this returns.
 */
function listenFrom(
  app: express.Express,
  host: string,
  preferred: number,
  attempts: number,
): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const tryPort = (port: number, left: number) => {
      const server = app.listen(port, host);
      server.once('listening', () => {
        const address = server.address() as AddressInfo | null;
        if (!address) {
          server.close();
          reject(new Error('Local API failed to report a listening address'));
          return;
        }
        resolve({ server, port: address.port });
      });
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && left > 0) {
          tryPort(port + 1, left - 1);
          return;
        }
        reject(err);
      });
    };
    tryPort(preferred, attempts);
  });
}

export async function startLocalApi(options: LocalApiOptions): Promise<LocalApiHandle> {
  const host = options.host ?? '127.0.0.1';
  const app = express();

  app.use(createLoopbackAuthGuard(options.authToken));
  // Hub surface, not cloud: a packaged build sets NODE_ENV=production, and the
  // renderer's LAN, Freenet and hub-handshake calls all come here.
  app.use(createApiApp({ surface: 'hub' }));

  // Static + SPA fallback must be registered after the API routes so `/api/*` is never shadowed.
  app.use(express.static(options.distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(options.distPath, 'index.html'));
  });

  const preferred = options.port && options.port > 0 ? options.port : APP_LOCAL_PORT_DEFAULT;
  const { server, port } = await listenFrom(app, host, preferred, APP_LOCAL_PORT_ATTEMPTS);

  return {
    url: `http://${host}:${port}`,
    port,
    close: () =>
      new Promise<void>((done) => {
        server.close(() => done());
      }),
  };
}
