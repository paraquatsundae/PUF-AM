/**
 * @vitest-environment jsdom
 *
 * Android host seam — attach-if-port-taken is the product path
 * (Plans/FREENET_NETWORK_PACK.md Phase 3). A node on :7509 is a host even
 * when our :freenet process has no binary.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ANDROID_FREENET_NO_BINARY,
  androidAttachedStatus,
  androidMissingBinaryStatus,
} from '../src/lib/androidFreenetHost.ts';
import { freenetHostCapabilityFor, getFreenetHostCapability } from '../src/lib/freenetHostCapability.ts';
import { freenetIsReadOnlyHere } from '../src/lib/freenetRuntime.ts';
import {
  androidFreenetHostBringUp,
  androidFreenetHostReadStatus,
  androidFreenetHostTakeDown,
  createAndroidFreenetBridge,
} from '../src/mist/freenetAndroidHost.ts';
import { resetLocalFreenetNode, setLocalFreenetNodeFoundForTests } from '../src/mist/freenetLocalNode.ts';
import { selectFreenetTransportKind } from '../src/mist/freenetPackTransport.ts';
import { hotKey } from '../units/mist-freenet/src/keys.ts';

afterEach(() => {
  resetLocalFreenetNode();
  delete window.pufamDesktop;
});

describe('capability — a live :7509 is android, the plugin is not', () => {
  it('is android when native and a loopback node has answered', () => {
    setLocalFreenetNodeFoundForTests(true);
    expect(freenetHostCapabilityFor({ desktop: false, native: true, androidHost: true })).toBe(
      'android',
    );
  });

  it('is still null on a native shell when :7509 has not answered', () => {
    expect(freenetHostCapabilityFor({ desktop: false, native: true })).toBe(null);
    expect(freenetHostCapabilityFor({ desktop: false, native: true, androidHost: false })).toBe(
      null,
    );
    expect(getFreenetHostCapability()).toBe(null);
  });
});

describe('androidFreenetHostBringUp', () => {
  it('attaches when :7509 answers, without starting our process', async () => {
    const pluginStart = vi.fn(async () => androidMissingBinaryStatus());
    const status = await androidFreenetHostBringUp({
      probe: async () => true,
      pluginAvailable: () => false,
      pluginStart,
    });
    expect(status.mode).toBe('attached');
    expect(status.reachable).toBe(true);
    expect(pluginStart).not.toHaveBeenCalled();
  });

  it('reports no android-arm64 binary when nothing is listening and there is no plugin', async () => {
    const status = await androidFreenetHostBringUp({
      probe: async () => false,
      pluginAvailable: () => false,
    });
    expect(status.mode).toBe('failed');
    expect(status.lastError).toBe(ANDROID_FREENET_NO_BINARY);
  });

  it('falls through to the plugin only after the loopback probe misses', async () => {
    const pluginStart = vi.fn(async () => androidAttachedStatus());
    const status = await androidFreenetHostBringUp({
      probe: async () => false,
      pluginAvailable: () => true,
      pluginStart,
    });
    expect(pluginStart).toHaveBeenCalledTimes(1);
    expect(status.mode).toBe('attached');
  });
});

describe('androidFreenetHostReadStatus / takeDown', () => {
  it('status is attached when the last probe found a node', async () => {
    const status = await androidFreenetHostReadStatus({
      nodeFound: () => true,
      pluginAvailable: () => false,
    });
    expect(status.mode).toBe('attached');
  });

  it('stop does not pretend we killed Freenet Android Node', async () => {
    const pluginStop = vi.fn(async () => androidMissingBinaryStatus());
    const after = await androidFreenetHostTakeDown({
      pluginAvailable: () => true,
      pluginStop,
      nodeFound: () => true,
    });
    expect(pluginStop).toHaveBeenCalled();
    expect(after.mode).toBe('attached');
  });
});

describe('createAndroidFreenetBridge data path', () => {
  it('exposes put/get/slot and publishes through the injected client', async () => {
    const put = vi.fn(async () => ({ uri: 'FN02@put' }));
    const bridge = createAndroidFreenetBridge({
      probe: async () => true,
      put,
      get: async () => new Uint8Array([1]),
      slotPut: async (input) => ({
        uri: 'FN02@slot',
        instanceIdBase58: input.instanceIdBase58,
        mode: 'put',
      }),
      slotGet: async () => new Uint8Array([2]),
    });
    expect(typeof bridge.put).toBe('function');
    const envelope = new TextEncoder().encode(
      JSON.stringify({ v: 1, alg: 'aes-256-gcm', iv: 'YQ', ct: 'YQ' }),
    );
    const result = await bridge.put({ bytes: envelope, key: 'mist/v1/farm/f/hot/current' });
    expect(result.uri).toBe('FN02@put');
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('refuses plaintext on put before the client runs', async () => {
    const put = vi.fn(async () => ({ uri: 'FN02@put' }));
    const bridge = createAndroidFreenetBridge({ put });
    const plain = new TextEncoder().encode(JSON.stringify({ farm_id: 'f', records: [] }));
    await expect(bridge.put({ bytes: plain, key: hotKey('f') })).rejects.toThrow(/plaintext|AEAD/);
    expect(put).not.toHaveBeenCalled();
  });
});

describe('transport + Send', () => {
  it('selects the host transport for android with a data path', () => {
    expect(selectFreenetTransportKind({ capability: 'android', bridgeHasDataPath: true })).toBe(
      'host',
    );
  });

  it('keeps the hub relay when :7509 is down even if a data bridge exists', () => {
    expect(selectFreenetTransportKind({ capability: null, bridgeHasDataPath: true })).toBe('relay');
  });

  it('lifts read-only when a local node can publish', () => {
    expect(freenetIsReadOnlyHere('android-local-node', false, true)).toBe(false);
    expect(freenetIsReadOnlyHere('android-local-node', false, false)).toBe(true);
  });
});
