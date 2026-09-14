import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchFreenetNodeRing } from './freenetNodeStatus.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200, contentType = 'application/json'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': contentType },
  });
}

describe('fetchFreenetNodeRing', () => {
  it('parses GET /status JSON when the node has one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/status')) {
          return jsonResponse({ peerCount: 3, version: '0.2.200' });
        }
        return new Response('nope', { status: 404 });
      }),
    );
    const ring = await fetchFreenetNodeRing('127.0.0.1', 7509);
    expect(ring).toMatchObject({ peerCount: 3, peerSource: 'count', nodeVersion: '0.2.200' });
  });

  it('does not scrape HTML from GET /status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/v1/version')) {
          return jsonResponse({ version: '0.2.135' });
        }
        return new Response('<!DOCTYPE html><html><body>own-loc 0.2</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }),
    );
    const ring = await fetchFreenetNodeRing('127.0.0.1', 7509);
    expect(ring).toMatchObject({ peerCount: 0, peerSource: 'unreported', nodeVersion: '0.2.135' });
    expect(ring?.peers).toEqual([]);
  });

  it('returns version-only when both status routes 404 (0.2.135)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/v1/version')) return jsonResponse({ version: '0.2.135' });
        return new Response('', { status: 404 });
      }),
    );
    const ring = await fetchFreenetNodeRing('127.0.0.1', 7509);
    expect(ring).toMatchObject({
      peerCount: 0,
      peerSource: 'unreported',
      nodeVersion: '0.2.135',
    });
  });

  it('fills N from this bake’s log when /status 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/v1/version')) return jsonResponse({ version: '0.2.135' });
        return new Response('', { status: 404 });
      }),
    );
    const dir = join(tmpdir(), `puf-fn-status-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'freenet.2026-09-14-10.log'),
      `${new Date().toISOString()}  INFO freenet::node::network_bridge::p2p_protoc: Event loop stats active_connections=26 ring_connections=26\n`,
    );
    const ring = await fetchFreenetNodeRing('127.0.0.1', 7509, dir);
    expect(ring).toMatchObject({
      peerCount: 26,
      peerSource: 'count',
      nodeVersion: '0.2.135',
    });
    expect(ring?.peers).toEqual([]);
  });
});
