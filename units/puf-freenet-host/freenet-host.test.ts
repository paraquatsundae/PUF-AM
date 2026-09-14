import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFreenetHost, freenetHostEnv } from './src/freenet-host.ts';
import { freenetBinaryFileName, freenetOsTag } from './src/resolve-binary.ts';
import { FreenetWireUnavailableError } from './src/errors.ts';
import { FREENET_PUT_WAIT_OPENNET } from './src/put-ready.ts';
import type { FreenetChildProcess, FreenetHostEvent } from './src/types.ts';

type FakeChild = FreenetChildProcess & {
  kills: string[];
  emitExit(code: number | null, signal?: NodeJS.Signals | null): void;
};

function createFakeChild(options: { exitOnKill?: boolean } = {}): FakeChild {
  const exitOnKill = options.exitOnKill ?? true;
  let exitListener: ((code: number | null, signal: NodeJS.Signals | null) => void) | undefined;
  const kills: string[] = [];

  const child = {
    pid: 4242,
    stdout: { on: () => undefined },
    stderr: { on: () => undefined },
    kills,
    on(event: string, listener: (...args: never[]) => void) {
      if (event === 'exit') {
        exitListener = listener as unknown as typeof exitListener;
      }
      return child;
    },
    kill(signal?: NodeJS.Signals) {
      kills.push(signal ?? 'SIGTERM');
      if (exitOnKill) child.emitExit(0, signal ?? 'SIGTERM');
      return true;
    },
    emitExit(code: number | null, signal: NodeJS.Signals | null = null) {
      exitListener?.(code, signal);
    },
  };

  return child as unknown as FakeChild;
}

/** Probe that answers from a queue, repeating the final value. */
function queuedProbe(answers: boolean[]) {
  let index = 0;
  const probe = async () => {
    const value = answers[Math.min(index, answers.length - 1)] ?? false;
    index += 1;
    return value;
  };
  return probe;
}

describe('createFreenetHost', () => {
  let tmpRoot: string;
  /** Resolution verifies executability, so the stub binary must really exist. */
  let stubBinary: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'puf-freenet-host-'));
    stubBinary = path.join(tmpRoot, 'freenet');
    writeFileSync(stubBinary, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  function dirs() {
    return {
      configDir: path.join(tmpRoot, 'config'),
      dataDir: path.join(tmpRoot, 'data'),
      logDir: path.join(tmpRoot, 'logs'),
    };
  }

  it('reports a stopped host without touching the network', async () => {
    const host = createFreenetHost({
      ...dirs(),
      probe: async () => {
        throw new Error('probe should not run while stopped');
      },
    });

    const status = await host.status();
    expect(status.hostId).toBe('puf-freenet-host');
    expect(status.mode).toBe('stopped');
    expect(status.reachable).toBe(false);
    expect(status.wsUrl).toBe('ws://127.0.0.1:7509/v1/contract/command');
    expect(status.updateRequired).toBe(false);
  });

  it('adopts a node that appeared since the last look when asked to probe', async () => {
    // The workshop refresh button is the only way to notice a node started
    // outside this host, or one that came up after our own start timed out.
    let nodeIsUp = false;
    const host = createFreenetHost({
      ...dirs(),
      probe: async () => nodeIsUp,
      identify: async () => nodeIsUp,
      inspect: async () =>
        nodeIsUp
          ? {
              pid: 1484,
              exe: '/home/george/.local/bin/freenet',
              cmdline: '/home/george/.local/bin/freenet network',
            }
          : null,
    });

    expect((await host.status({ probe: true })).mode).toBe('stopped');

    nodeIsUp = true;
    const status = await host.status({ probe: true });

    expect(status.mode).toBe('attached');
    expect(status.attachKind).toBe('login-leftover');
    expect(status.reachable).toBe(true);
    expect(status.pid).toBeUndefined();
  });

  it('attaches to an already-running node instead of spawning a second one', async () => {
    let spawnCalls = 0;
    const host = createFreenetHost({
      ...dirs(),
      probe: async () => true,
      identify: async () => true,
      inspect: async () => ({
        pid: 1484,
        uid: typeof process.getuid === 'function' ? process.getuid() : 1000,
        exe: '/home/george/.local/bin/freenet',
        cwd: '/home/george',
        cmdline: '/home/george/.local/bin/freenet network',
      }),
      spawn: () => {
        spawnCalls += 1;
        return createFakeChild();
      },
    });

    const status = await host.start();
    expect(status.mode).toBe('attached');
    expect(status.attachKind).toBe('login-leftover');
    expect(status.reachable).toBe(true);
    expect(status.pid).toBeUndefined();
    expect(spawnCalls).toBe(0);
  });

  it('keeps managed after start when a later status probe sees :7509', async () => {
    const child = createFakeChild();
    const host = createFreenetHost({
      ...dirs(),
      binaryPath: stubBinary,
      probe: queuedProbe([false, true, true]),
      identify: async () => true,
      inspect: async () => ({
        pid: 4242,
        exe: stubBinary,
        cmdline: `${stubBinary} network --config-dir ${dirs().configDir}`,
      }),
      readVersion: async () => undefined,
      spawn: () => child,
    });

    expect((await host.start()).mode).toBe('managed');
    const after = await host.status({ probe: true });
    expect(after.mode).toBe('managed');
    expect(after.attachKind).toBeUndefined();
    expect(after.pid).toBe(4242);
  });

  it('does not flip managed to attached when start() runs again after a probe flake', async () => {
    const child = createFakeChild();
    const host = createFreenetHost({
      ...dirs(),
      binaryPath: stubBinary,
      // free → child up → flake down → still our child
      probe: queuedProbe([false, true, false, true]),
      identify: async () => true,
      inspect: async () => ({ pid: 4242, exe: stubBinary }),
      readVersion: async () => undefined,
      spawn: () => child,
    });

    expect((await host.start()).mode).toBe('managed');
    expect((await host.status({ probe: true })).mode).toBe('managed');
    const again = await host.start();
    expect(again.mode).toBe('managed');
    expect(again.attachKind).toBeUndefined();
  });

  it('treats a port holder that is our bundled binary as managed, not attached', async () => {
    const bundled = stubBinary;
    const host = createFreenetHost({
      ...dirs(),
      binaryPath: bundled,
      probe: async () => true,
      identify: async () => true,
      inspect: async () => ({
        pid: 77,
        uid: typeof process.getuid === 'function' ? process.getuid() : 1000,
        exe: bundled,
        cmdline: `${bundled} network --config-dir ${dirs().configDir}`,
      }),
      spawn: () => {
        throw new Error('must not spawn when the listener is already our binary');
      },
    });

    const status = await host.start();
    expect(status.mode).toBe('managed');
    expect(status.attachKind).toBeUndefined();
    expect(status.pid).toBe(77);
  });

  it('attaches with other-appimage when a different PUF-AM mount holds the port', async () => {
    const host = createFreenetHost({
      ...dirs(),
      binaryPath: stubBinary,
      probe: async () => true,
      identify: async () => true,
      inspect: async () => ({
        pid: 9,
        uid: typeof process.getuid === 'function' ? process.getuid() : 1000,
        exe: '/tmp/.mount_PUF-AMoldxxxx/resources/freenet/freenet',
        cmdline:
          '/tmp/.mount_PUF-AMoldxxxx/resources/freenet/freenet network --config-dir /home/x/.config/PUF-AM/freenet/config',
      }),
      spawn: () => {
        throw new Error('must not spawn over another AppImage');
      },
    });

    const status = await host.start();
    expect(status.mode).toBe('attached');
    expect(status.attachKind).toBe('other-appimage');
  });

  it('does not attach to a TCP listener that is not Freenet 0.2', async () => {
    let spawnCalls = 0;
    const child = createFakeChild({ exitOnKill: false });
    const host = createFreenetHost({
      ...dirs(),
      binaryPath: stubBinary,
      startTimeoutMs: 80,
      probe: async () => true,
      identify: async () => false,
      spawn: () => {
        spawnCalls += 1;
        return child;
      },
    });

    await expect(host.start()).rejects.toThrow(/not Freenet 0\.2/);
    const status = await host.status();
    expect(status.mode).toBe('failed');
    expect(status.reachable).toBe(false);
    expect(status.lastError).toMatch(/not Freenet 0\.2/);
    expect(spawnCalls).toBe(1);
  });

  it('does not adopt a non-Freenet listener when probing while stopped', async () => {
    const host = createFreenetHost({
      ...dirs(),
      probe: async () => true,
      identify: async () => false,
    });

    const status = await host.status({ probe: true });
    expect(status.mode).toBe('stopped');
    expect(status.reachable).toBe(false);
  });

  it('detaches without killing a node it did not start', async () => {
    const child = createFakeChild();
    const host = createFreenetHost({
      ...dirs(),
      probe: async () => true,
      identify: async () => true,
      inspect: async () => ({
        pid: 1484,
        exe: '/home/george/.local/bin/freenet',
        cmdline: '/home/george/.local/bin/freenet network',
      }),
      spawn: () => child,
    });

    await host.start();
    const status = await host.stop();

    expect(status.mode).toBe('stopped');
    expect(child.kills).toEqual([]);
  });

  it('spawns a managed node with app-owned dirs and loopback WS args', async () => {
    const child = createFakeChild();
    let spawnedArgs: string[] = [];
    let spawnedPath = '';

    const host = createFreenetHost({
      ...dirs(),
      wsPort: 7609,
      binaryPath: stubBinary,
      probe: queuedProbe([false, true]),
      identify: async () => true,
      readVersion: async () => 'Freenet version: 0.2.118 (test)',
      spawn: (binaryPath, args) => {
        spawnedPath = binaryPath;
        spawnedArgs = args;
        return child;
      },
    });

    const status = await host.start();

    expect(status.mode).toBe('managed');
    expect(status.pid).toBe(4242);
    expect(status.binary).toEqual({
      path: stubBinary,
      source: 'option',
      version: 'Freenet version: 0.2.118 (test)',
    });
    expect(spawnedPath).toBe(stubBinary);
    expect(spawnedArgs.slice(0, 5)).toEqual([
      'network',
      '--ws-api-address',
      '127.0.0.1',
      '--ws-api-port',
      '7609',
    ]);
    expect(spawnedArgs).toContain(dirs().dataDir);
    expect(spawnedArgs).toContain(dirs().logDir);
  });

  it('finds the vendor build when the host is given a repo root', async () => {
    // Without the repoRoot passthrough, resolution step 4 (plan §5.3) is unreachable
    // from the host and Phase 2's vendor/ dir would silently lose to PATH.
    const vendorDir = path.join(
      tmpRoot,
      'vendor',
      'freenet',
      `${freenetOsTag(process.platform)}-${process.arch}`,
    );
    mkdirSync(vendorDir, { recursive: true });
    const vendorBinary = path.join(vendorDir, freenetBinaryFileName('freenet', process.platform));
    writeFileSync(vendorBinary, '#!/bin/sh\nexit 0\n', { mode: 0o755 });

    const host = createFreenetHost({
      ...dirs(),
      repoRoot: tmpRoot,
      env: { PATH: '' },
      probe: queuedProbe([false, true]),
      identify: async () => true,
      readVersion: async () => undefined,
      spawn: () => createFakeChild(),
    });

    const status = await host.start();

    expect(status.mode).toBe('managed');
    expect(status.binary?.source).toBe('vendor');
    expect(status.binary?.path).toBe(vendorBinary);
  });

  it('release leaves a managed child running', async () => {
    const child = createFakeChild();
    const host = createFreenetHost({
      ...dirs(),
      binaryPath: stubBinary,
      probe: queuedProbe([false, true]),
      identify: async () => true,
      readVersion: async () => undefined,
      spawn: () => child,
    });

    await host.start();
    const status = await host.release?.();

    expect(child.kills).toEqual([]);
    expect(status?.mode).toBe('stopped');
  });

  it('release does not kill an attached node', async () => {
    const child = createFakeChild();
    const host = createFreenetHost({
      ...dirs(),
      probe: async () => true,
      identify: async () => true,
      inspect: async () => ({
        pid: 1484,
        exe: '/home/george/.local/bin/freenet',
        cmdline: '/home/george/.local/bin/freenet network',
      }),
      spawn: () => child,
    });

    await host.start();
    expect((await host.status()).mode).toBe('attached');
    const status = await host.release?.();

    expect(child.kills).toEqual([]);
    expect(status?.mode).toBe('stopped');
  });

  it('terminates a managed node on stop', async () => {
    const child = createFakeChild();
    const host = createFreenetHost({
      ...dirs(),
      binaryPath: stubBinary,
      probe: queuedProbe([false, true]),
      identify: async () => true,
      readVersion: async () => undefined,
      spawn: () => child,
    });

    await host.start();
    const status = await host.stop();

    expect(child.kills).toEqual(['SIGTERM']);
    expect(status.mode).toBe('stopped');
    expect(status.reachable).toBe(false);
  });

  it('flags exit 42 as update-required and does not restart', async () => {
    const child = createFakeChild({ exitOnKill: false });
    const events: FreenetHostEvent[] = [];

    const host = createFreenetHost({
      ...dirs(),
      binaryPath: stubBinary,
      probe: queuedProbe([false, true]),
      identify: async () => true,
      readVersion: async () => undefined,
      spawn: () => child,
    });
    host.on((event) => events.push(event));

    await host.start();
    child.emitExit(42);

    const status = await host.status();
    expect(status.mode).toBe('failed');
    expect(status.updateRequired).toBe(true);
    expect(status.lastExitCode).toBe(42);
    expect(events.some((event) => event.type === 'update-required')).toBe(true);
  });

  it('refuses ciphertext operations when no wire client is injected', async () => {
    const host = createFreenetHost(dirs());

    await expect(host.putCiphertext(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(
      FreenetWireUnavailableError,
    );
    await expect(host.getCiphertext('FN02@abc')).rejects.toBeInstanceOf(
      FreenetWireUnavailableError,
    );
  });

  it('delegates ciphertext put/get to the injected wire client', async () => {
    const seen: Uint8Array[] = [];
    const host = createFreenetHost({
      ...dirs(),
      wire: {
        putCiphertext: async (bytes) => {
          seen.push(bytes);
          return { uri: 'FN02@stub', identifier: 'test' };
        },
        getCiphertext: async () => new Uint8Array([9]),
      },
    });

    await expect(host.putCiphertext(new Uint8Array([1]))).resolves.toEqual({
      uri: 'FN02@stub',
      identifier: 'test',
    });
    await expect(host.getCiphertext('FN02@stub')).resolves.toEqual(new Uint8Array([9]));
    expect(seen).toHaveLength(1);
  });

  it('records a host PUT on status when the identifier is a Hot key', async () => {
    const host = createFreenetHost({
      ...dirs(),
      wire: {
        putCiphertext: async () => ({ uri: 'FN02@hot' }),
        getCiphertext: async () => null,
      },
    });
    await host.putCiphertext(new Uint8Array([1]), {
      identifier: 'mist/v1/farm/f1/hot/current',
    });
    const status = await host.status();
    expect(status.contractTraffic?.[0]).toMatchObject({
      op: 'put',
      slotKind: 'hot',
      label: 'Sent Hot',
      source: 'host',
      contractKey: 'FN02@hot',
    });
  });

  it('refuses PUT on a live node that is still joining', async () => {
    mkdirSync(path.join(tmpRoot, 'logs'), { recursive: true });
    writeFileSync(
      path.join(tmpRoot, 'logs', 'freenet.2026-09-14-12.log'),
      `${new Date().toISOString()} INFO ring_connections=0\n`,
    );
    const host = createFreenetHost({
      ...dirs(),
      binaryPath: stubBinary,
      probe: async () => true,
      identify: async () => true,
      inspect: async () => ({
        pid: 77,
        uid: typeof process.getuid === 'function' ? process.getuid() : 1000,
        exe: stubBinary,
        cmdline: `${stubBinary} network`,
      }),
      spawn: () => {
        throw new Error('must not spawn');
      },
      wire: {
        putCiphertext: async () => ({ uri: 'FN02@no' }),
        getCiphertext: async () => null,
      },
    });
    await host.start();
    await expect(host.putCiphertext(new Uint8Array([1]))).rejects.toThrow(FREENET_PUT_WAIT_OPENNET);
  });

  it('allows PUT once the log reports a ring peer', async () => {
    mkdirSync(path.join(tmpRoot, 'logs'), { recursive: true });
    writeFileSync(
      path.join(tmpRoot, 'logs', 'freenet.2026-09-14-12.log'),
      `${new Date().toISOString()} INFO ring_connections=2\n`,
    );
    const host = createFreenetHost({
      ...dirs(),
      binaryPath: stubBinary,
      probe: async () => true,
      identify: async () => true,
      inspect: async () => ({
        pid: 77,
        uid: typeof process.getuid === 'function' ? process.getuid() : 1000,
        exe: stubBinary,
        cmdline: `${stubBinary} network`,
      }),
      spawn: () => {
        throw new Error('must not spawn');
      },
      wire: {
        putCiphertext: async () => ({ uri: 'FN02@yes' }),
        getCiphertext: async () => null,
      },
    });
    await host.start();
    await expect(host.putCiphertext(new Uint8Array([1]))).resolves.toEqual({ uri: 'FN02@yes' });
  });

describe('stopAllOurs kill switch', () => {
  it('stops a managed child and reports the port free', async () => {
    const child = createFakeChild();
    const host = createFreenetHost({
      ...dirs(),
      binaryPath: stubBinary,
      probe: queuedProbe([false, true, false]),
      identify: async () => true,
      inspect: async () => null,
      spawn: () => child,
    });
    expect((await host.start()).mode).toBe('managed');
    const after = await host.stopAllOurs!();
    expect(child.kills[0]).toBe('SIGTERM');
    expect(after.mode).toBe('stopped');
    expect(after.leftover).toBe('none');
    expect(after.portFree).toBe(true);
    expect(after.stoppedOurs).toBe(true);
  });

  it('signals a same-uid leftover we attached to', async () => {
    const kills: Array<{ pid: number; signal: string }> = [];
    let portUp = true;
    const host = createFreenetHost({
      ...dirs(),
      binaryPath: stubBinary,
      probe: async () => portUp,
      identify: async () => portUp,
      inspect: async () => ({
        pid: 77,
        uid: typeof process.getuid === 'function' ? process.getuid() : 1000,
        exe: stubBinary,
        cmdline: `${stubBinary} network --config-dir ${dirs().configDir}`,
      }),
      spawn: () => {
        throw new Error('must not spawn');
      },
      killPid: (pid, signal) => {
        kills.push({ pid, signal });
        portUp = false;
        return true;
      },
    });
    expect((await host.start()).mode).toBe('managed');
    const after = await host.stopAllOurs!();
    expect(kills.some((k) => k.pid === 77 && k.signal === 'SIGTERM')).toBe(true);
    expect(after.leftover).toBe('none');
    expect(after.portFree).toBe(true);
  });

  it('does not signal a foreign leftover or call systemctl without confirm', async () => {
    const kills: number[] = [];
    const stopService = vi.fn(async () => true);
    const host = createFreenetHost({
      ...dirs(),
      binaryPath: stubBinary,
      probe: async () => true,
      identify: async () => true,
      inspect: async () => ({
        pid: 1484,
        uid: typeof process.getuid === 'function' ? process.getuid() : 1000,
        exe: '/usr/local/bin/other-freenet',
        cmdline: '/usr/local/bin/other-freenet network',
      }),
      spawn: () => {
        throw new Error('must not spawn');
      },
      killPid: (pid) => {
        kills.push(pid);
        return true;
      },
      stopUserService: stopService,
    });
    expect((await host.start()).mode).toBe('attached');
    const after = await host.stopAllOurs!();
    expect(kills).toEqual([]);
    expect(stopService).not.toHaveBeenCalled();
    expect(after.leftover).toBe('foreign');
    expect(after.portFree).toBe(false);
    expect(after.mode).toBe('attached');
  });

  it('stops freenet.service only after confirm', async () => {
    let portUp = true;
    const stopService = vi.fn(async () => {
      portUp = false;
      return true;
    });
    const host = createFreenetHost({
      ...dirs(),
      binaryPath: stubBinary,
      probe: async () => portUp,
      identify: async () => portUp,
      inspect: async () => ({
        pid: 1484,
        uid: typeof process.getuid === 'function' ? process.getuid() : 1000,
        exe: '/home/george/.local/bin/freenet',
        cmdline: '/home/george/.local/bin/freenet network',
        cwd: '/home/george/.local/share/freenet',
      }),
      spawn: () => {
        throw new Error('must not spawn');
      },
      stopUserService: stopService,
    });
    expect((await host.start()).mode).toBe('attached');
    const first = await host.stopAllOurs!();
    expect(stopService).not.toHaveBeenCalled();
    expect(first.leftover).toBe('login-service');
    const second = await host.stopAllOurs!({ stopUserService: true });
    expect(stopService).toHaveBeenCalledTimes(1);
    expect(second.leftover).toBe('none');
    expect(second.portFree).toBe(true);
  });
});
});

describe('freenetHostEnv', () => {
  it('emits the env contract units/mist-freenet already reads', async () => {
    const host = createFreenetHost({
      configDir: '/tmp/c',
      dataDir: '/tmp/d',
      logDir: '/tmp/l',
      wsPort: 7609,
    });
    const status = await host.status();

    expect(
      freenetHostEnv(status, {
        packWasm: '/opt/contracts/pack-contract.wasm',
        slotWasm: '/opt/contracts/slot-contract.wasm',
        mistRoot: '/home/op/.config/PUF-AM/mist-freenet',
      }),
    ).toEqual({
      FREENET_WS_URL: 'ws://127.0.0.1:7609/v1/contract/command',
      FREENET_WS_PORT: '7609',
      FREENET_PACK_WASM: '/opt/contracts/pack-contract.wasm',
      FREENET_SLOT_WASM: '/opt/contracts/slot-contract.wasm',
      MIST_FREENET_ROOT: '/home/op/.config/PUF-AM/mist-freenet',
    });
  });
});
