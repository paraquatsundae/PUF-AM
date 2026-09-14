import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import {
  freenetPortNotFreenetMessage,
  identifyFreenet02Listener,
} from './src/identify-freenet02.ts';

let server: http.Server | undefined;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
});

function listen(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<number> {
  return new Promise((resolve, reject) => {
    server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server!.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('no port'));
        return;
      }
      resolve(addr.port);
    });
    server.on('error', reject);
  });
}

describe('identifyFreenet02Listener', () => {
  it('accepts GET /v1/version from Freenet 0.2', async () => {
    const port = await listen((req, res) => {
      if (req.url?.startsWith('/v1/version')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ version: '0.2.135' }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await expect(identifyFreenet02Listener('127.0.0.1', port, 800)).resolves.toBe(true);
  });

  it('refuses an HTML leftover on the same port', async () => {
    const port = await listen((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!DOCTYPE html><html><title>Dashboard</title></html>');
    });
    await expect(identifyFreenet02Listener('127.0.0.1', port, 800)).resolves.toBe(false);
  });

  it('accepts a WS 101 hello when /v1/version is absent', async () => {
    const port = await listen((req, res) => {
      if (req.url?.startsWith('/v1/contract/command') && req.headers.upgrade === 'websocket') {
        res.writeHead(101, {
          Upgrade: 'websocket',
          Connection: 'Upgrade',
        });
        res.end();
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await expect(identifyFreenet02Listener('127.0.0.1', port, 800)).resolves.toBe(true);
  });
});

describe('freenetPortNotFreenetMessage', () => {
  it('names the occupant without calling it Freenet', () => {
    expect(freenetPortNotFreenetMessage('127.0.0.1', 7509)).toBe(
      '127.0.0.1:7509 is in use by something that is not Freenet 0.2',
    );
  });
});
