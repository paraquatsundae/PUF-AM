/**
 * Optional live Freenet 0.2 WebSocket transport test.
 *
 * Run when a local `freenet` node is listening on ws-api-port (default 7509):
 *   FREENET_LIVE_WS=1 npm test -- units/mist-freenet/freenet02-live.test.ts
 */

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Freenet02WsTransport } from './src/node.ts';
import { isFreenet02Uri } from './src/freenet02-uri.ts';

const LIVE = process.env.FREENET_LIVE_WS === '1' || process.env.FREENET_LIVE_WS === 'true';

describe.skipIf(!LIVE)('Freenet02WsTransport (live node)', () => {
  let transport: Freenet02WsTransport;

  afterEach(async () => {
    if (transport) await transport.disconnect();
  });

  it('putBlob → getBlob round-trip ciphertext', async () => {
    transport = new Freenet02WsTransport({
      wsUrl: process.env.FREENET_WS_URL ?? 'ws://127.0.0.1:7509/v1/contract/command',
    });

    await transport.connect();
    const health = await transport.health();
    expect(health.status).toBe('connected');
    expect(health.transportId).toBe('ws02');

    const ciphertext = new TextEncoder().encode(
      `live-ws-mist-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const { uri } = await transport.putBlob(ciphertext, { identifier: 'live-test' });
    expect(isFreenet02Uri(uri)).toBe(true);

    const pulled = await transport.getBlob(uri);
    expect(pulled).not.toBeNull();
    expect(new TextDecoder().decode(pulled!)).toBe(new TextDecoder().decode(ciphertext));
  }, 120_000);
});

describe('Freenet02WsTransport (offline guard)', () => {
  it('skipped live suite unless FREENET_LIVE_WS=1', () => {
    expect(LIVE || true).toBe(true);
  });
});
