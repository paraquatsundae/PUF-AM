/**
 * Optional live native PUT against a real 0.2 node — the APK host spike go/no-go.
 *
 *   FREENET_LIVE_WS=1 npm test -- units/mist-freenet/freenet02-native-put-live.test.ts
 *
 * Uses the bundled pack-contract.wasm and the node on :7509 (or FREENET_WS_URL).
 * A hang is a recorded failure (`hung: true`), not an infinite wait.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { BrowserFreenetGetClient } from './src/freenet02-browser-get.ts';
import { DEFAULT_LOCAL_FREENET_WS_URL } from './src/freenet02-browser-get-url.ts';
import {
  BrowserFreenetPutClient,
  FreenetNativePutError,
} from './src/freenet02-native-put.ts';

const LIVE = process.env.FREENET_LIVE_WS === '1' || process.env.FREENET_LIVE_WS === 'true';
const WS_URL = process.env.FREENET_WS_URL ?? DEFAULT_LOCAL_FREENET_WS_URL;

const WASM_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'assets/pack-contract.wasm',
);

describe.skipIf(!LIVE)('BrowserFreenetPutClient (live node)', () => {
  let put: BrowserFreenetPutClient;
  let get: BrowserFreenetGetClient;

  afterEach(async () => {
    if (put) await put.disconnect();
    if (get) await get.disconnect();
  });

  it('puts a unique blob and reads the same bytes back', async () => {
    const wasm = new Uint8Array(await readFile(WASM_PATH));
    const data = new TextEncoder().encode(`pufam-native-put-${Date.now()}-${Math.random()}`);

    put = new BrowserFreenetPutClient({ wsUrl: WS_URL });
    get = new BrowserFreenetGetClient({ wsUrl: WS_URL });

    let result;
    try {
      result = await put.putPackBlob({ data, wasm });
    } catch (error) {
      if (error instanceof FreenetNativePutError && error.hung) {
        throw new Error(
          `SPIKE NO-GO: native bincode PUT hung (${error.message}). Tablet Send stays on fdev/hub.`,
        );
      }
      throw error;
    }

    expect(result.uri.startsWith('FN02@')).toBe(true);
    expect(result.elapsedMs).toBeLessThan(45_000);

    const fetched = await get.getBlob(result.uri, { deadlineMs: 60_000 });
    expect(fetched).not.toBeNull();
    expect(fetched).toEqual(data);
  }, 120_000);
});
