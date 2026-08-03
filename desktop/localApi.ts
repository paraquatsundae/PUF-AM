/**
 * Loopback API + static host for the Electron shell.
 *
 * The renderer is served from the *same* origin as `/api/*`, so `getApiBaseUrl()`
 * stays same-origin and no CORS or CSP special-casing is needed. Binds
 * `127.0.0.1` on an ephemeral port — never `0.0.0.0` (today's `npm run dev` does,
 * which is strictly worse).
 *
 * Phase 4 hardening: per-launch bearer token minted here and injected via
 * preload, or move Freenet calls to IPC and drop HTTP entirely.
 * See `Plans/DESKTOP_FREENET_PLUGIN.md` §6.
 */

import type { AddressInfo } from 'node:net';
import path from 'node:path';

import express from 'express';

import { createApiApp } from '../server/createApiApp.ts';

export type LocalApiHandle = {
  url: string;
  port: number;
  close(): Promise<void>;
};

export type LocalApiOptions = {
  /** Built Vite bundle to serve (packaged: inside app resources). */
  distPath: string;
  host?: string;
};

export function startLocalApi(options: LocalApiOptions): Promise<LocalApiHandle> {
  const host = options.host ?? '127.0.0.1';
  const app = createApiApp();

  // Static + SPA fallback must be registered after the API routes so `/api/*` is never shadowed.
  app.use(express.static(options.distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(options.distPath, 'index.html'));
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(0, host, () => {
      const address = server.address() as AddressInfo | null;
      if (!address) {
        reject(new Error('Local API failed to report a listening address'));
        return;
      }
      resolve({
        url: `http://${host}:${address.port}`,
        port: address.port,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
    server.once('error', reject);
  });
}
