import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFreenetHost, freenetHostEnv } from './src/freenet-host.ts';
import { FreenetWireUnavailableError } from './src/errors.ts';
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

  it('attaches to an already-running node instead of spawning a second one', async () => {
    let spawnCalls = 0;
    const host = createFreenetHost({
      ...dirs(),
      probe: async () => true,
      spawn: () => {
        spawnCalls += 1;
        return createFakeChild();
      },
    });

    const status = await host.start();
    expect(status.mode).toBe('attached');
    expect(status.reachable).toBe(true);
    expect(status.pid).toBeUndefined();
    expect(spawnCalls).toBe(0);
  });

  it('detaches without killing a node it did not start', async () => {
    const child = createFakeChild();
    const host = createFreenetHost({
      ...dirs(),
      probe: async () => true,
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

  it('terminates a managed node on stop', async () => {
    const child = createFakeChild();
    const host = createFreenetHost({
      ...dirs(),
      binaryPath: stubBinary,
      probe: queuedProbe([false, true]),
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
        fdevBin: '/opt/bundled/fdev',
        packWasm: '/opt/contracts/pack-contract.wasm',
        mistRoot: '/home/op/.config/PUF-AM/mist-freenet',
      }),
    ).toEqual({
      FREENET_TRANSPORT: 'ws02',
      FREENET_WS_URL: 'ws://127.0.0.1:7609/v1/contract/command',
      FREENET_WS_PORT: '7609',
      FDEV_BIN: '/opt/bundled/fdev',
      FREENET_PACK_WASM: '/opt/contracts/pack-contract.wasm',
      MIST_FREENET_ROOT: '/home/op/.config/PUF-AM/mist-freenet',
    });
  });
});
