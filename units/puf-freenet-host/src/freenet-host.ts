/**
 * PUF Freenet Host — owns the lifecycle of a bundled `freenet` node.
 *
 * v1 is a **managed child process**, not a linked library: Freenet 0.2 ships as
 * a Rust binary with a loopback WebSocket API. The operator never installs,
 * configures, or sees it — PUF-AM starts and stops it. See
 * `Plans/DESKTOP_FREENET_PLUGIN.md` §4.
 *
 * Node-only (`node:child_process`, `node:net`, `node:fs`). Never import from
 * renderer/browser code.
 */

import { spawn as nodeSpawn, execFile } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import {
  FreenetHostStartTimeoutError,
  FreenetWireUnavailableError,
} from './errors.ts';
import { FREENET_BINARY, resolveFreenetBinaryOrThrow } from './resolve-binary.ts';
import type {
  FreenetBinaryInfo,
  FreenetChildProcess,
  FreenetHostEvent,
  FreenetHostEventListener,
  FreenetHostMode,
  FreenetHostOptions,
  FreenetHostPlugin,
  FreenetHostStatus,
  FreenetPutCiphertextOptions,
  FreenetPutCiphertextResult,
} from './types.ts';

export const FREENET_HOST_ID = 'puf-freenet-host';

/** `freenet network` default ws-api-port. */
export const DEFAULT_FREENET_WS_PORT = 7509;
export const DEFAULT_FREENET_WS_HOST = '127.0.0.1';

/** Freenet exits 42 to request an update; applying it needs a supervisor we deliberately are not. */
const FREENET_UPDATE_EXIT_CODE = 42;

const PROBE_TIMEOUT_MS = 1_500;
const PROBE_INTERVAL_MS = 750;
const RESTART_BACKOFF_MS = [1_000, 3_000, 8_000];

export function freenetWsUrl(host: string, port: number): string {
  return `ws://${host}:${port}/v1/contract/command`;
}

/** TCP connect probe — cheap liveness check for the node's WS API. */
export function probeTcpPort(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (reachable: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(reachable);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

function readFreenetVersion(binaryPath: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(binaryPath, ['--version'], { timeout: 5_000 }, (err, stdout) => {
      if (err) return resolve(undefined);
      const firstLine = String(stdout).split('\n')[0]?.trim();
      resolve(firstLine || undefined);
    });
  });
}

function defaultSpawn(
  binaryPath: string,
  args: string[],
  env: Record<string, string | undefined>,
): FreenetChildProcess {
  return nodeSpawn(binaryPath, args, {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

/** Emit whole lines only — Freenet log chunks split mid-line. */
function createLineReader(onLine: (line: string) => void): (chunk: unknown) => void {
  let buffer = '';
  return (chunk: unknown) => {
    buffer += String(chunk);
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trimEnd();
      if (trimmed) onLine(trimmed);
    }
  };
}

export function createFreenetHost(options: FreenetHostOptions): FreenetHostPlugin {
  const wsHost = options.wsHost ?? DEFAULT_FREENET_WS_HOST;
  const wsPort = options.wsPort ?? DEFAULT_FREENET_WS_PORT;
  const networkMode = options.networkMode ?? 'network';
  const attachIfRunning = options.attachIfRunning ?? true;
  const autoRestart = options.autoRestart ?? true;
  const maxRestartAttempts = options.maxRestartAttempts ?? RESTART_BACKOFF_MS.length;
  const startTimeoutMs = options.startTimeoutMs ?? 45_000;
  const stopGraceMs = options.stopGraceMs ?? 8_000;
  const spawnFn = options.spawn ?? defaultSpawn;
  const probe = options.probe ?? probeTcpPort;
  const readVersion = options.readVersion ?? readFreenetVersion;
  const baseEnv = options.env ?? process.env;

  const configDir = path.resolve(options.configDir);
  const dataDir = path.resolve(options.dataDir);
  const logDir = path.resolve(options.logDir);

  const listeners = new Set<FreenetHostEventListener>();
  let mode: FreenetHostMode = 'stopped';
  let child: FreenetChildProcess | null = null;
  let binary: FreenetBinaryInfo | undefined;
  let reachable = false;
  let updateRequired = false;
  let startedAt: string | undefined;
  let lastExitCode: number | null | undefined;
  let lastError: string | undefined;
  let stopping = false;
  let restartAttempts = 0;
  let exitWaiters: Array<() => void> = [];
  let startInFlight: Promise<FreenetHostStatus> | null = null;

  function snapshot(): FreenetHostStatus {
    return {
      hostId: FREENET_HOST_ID,
      mode,
      reachable,
      wsUrl: freenetWsUrl(wsHost, wsPort),
      wsHost,
      wsPort,
      pid: mode === 'managed' ? child?.pid : undefined,
      binary,
      configDir,
      dataDir,
      logDir,
      updateRequired,
      startedAt,
      lastExitCode,
      lastError,
    };
  }

  function emit(event: FreenetHostEvent): void {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        /* a bad subscriber must not take down the host */
      }
    }
  }

  function emitState(): void {
    emit({ type: 'state', status: snapshot() });
  }

  function ensureDirs(): void {
    for (const dir of [configDir, dataDir, logDir]) {
      mkdirSync(dir, { recursive: true });
    }
  }

  function buildArgs(): string[] {
    return [
      networkMode,
      '--ws-api-address',
      wsHost,
      '--ws-api-port',
      String(wsPort),
      '--config-dir',
      configDir,
      '--data-dir',
      dataDir,
      '--log-dir',
      logDir,
    ];
  }

  function settleExitWaiters(): void {
    const waiters = exitWaiters;
    exitWaiters = [];
    for (const waiter of waiters) waiter();
  }

  function handleExit(code: number | null, signal: NodeJS.Signals | null): void {
    child = null;
    reachable = false;
    lastExitCode = code;
    settleExitWaiters();
    emit({ type: 'exit', code, signal });

    if (stopping) {
      mode = 'stopped';
      emitState();
      return;
    }

    if (code === FREENET_UPDATE_EXIT_CODE) {
      // Bundled binaries are version-pinned alongside the pack-contract code hash;
      // updating in place would silently change every published URI.
      updateRequired = true;
      mode = 'failed';
      lastError = 'Freenet requested an update (exit 42) — bundled node left untouched';
      emit({ type: 'update-required', version: binary?.version });
      emitState();
      return;
    }

    if (autoRestart && restartAttempts < maxRestartAttempts) {
      const delay = RESTART_BACKOFF_MS[Math.min(restartAttempts, RESTART_BACKOFF_MS.length - 1)]!;
      restartAttempts += 1;
      mode = 'starting';
      lastError = `Freenet exited (code=${code} signal=${signal}); restart ${restartAttempts}/${maxRestartAttempts} in ${delay} ms`;
      emitState();
      void sleep(delay).then(() => {
        if (stopping || child) return;
        void start().catch((err: unknown) => {
          lastError = err instanceof Error ? err.message : String(err);
          mode = 'failed';
          emitState();
        });
      });
      return;
    }

    mode = 'failed';
    lastError = `Freenet exited (code=${code} signal=${signal})`;
    emitState();
  }

  async function waitForReachable(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!child && mode === 'starting') {
        // Process died while we were waiting — handleExit owns the state.
        return false;
      }
      if (await probe(wsHost, wsPort, PROBE_TIMEOUT_MS)) return true;
      await sleep(PROBE_INTERVAL_MS);
    }
    return false;
  }

  async function doStart(): Promise<FreenetHostStatus> {
    if ((mode === 'managed' || mode === 'attached') && reachable) return snapshot();

    stopping = false;
    mode = 'starting';
    lastError = undefined;
    emitState();

    if (await probe(wsHost, wsPort, PROBE_TIMEOUT_MS)) {
      if (attachIfRunning) {
        // Another PUF unit or a workshop `freenet network` owns this node.
        // Use it, and never kill what we did not start.
        mode = 'attached';
        reachable = true;
        startedAt = new Date().toISOString();
        emitState();
        return snapshot();
      }
      mode = 'failed';
      lastError = `Port ${wsPort} already in use and attachIfRunning is false`;
      emitState();
      throw new Error(lastError);
    }

    ensureDirs();

    let resolved: Pick<FreenetBinaryInfo, 'path' | 'source'>;
    try {
      resolved = resolveFreenetBinaryOrThrow(FREENET_BINARY, {
        binaryPath: options.binaryPath,
        searchPaths: options.binarySearchPaths,
        repoRoot: options.repoRoot,
        env: baseEnv,
      });
    } catch (err) {
      mode = 'failed';
      lastError = err instanceof Error ? err.message : String(err);
      emitState();
      throw err;
    }

    binary = { ...resolved, version: await readVersion(resolved.path) };

    const proc = spawnFn(resolved.path, buildArgs(), { ...baseEnv, MODE: networkMode });
    child = proc;

    proc.stdout?.on(
      'data',
      createLineReader((line) => emit({ type: 'log', stream: 'stdout', line })),
    );
    proc.stderr?.on(
      'data',
      createLineReader((line) => {
        lastError = line;
        emit({ type: 'log', stream: 'stderr', line });
      }),
    );
    proc.on('error', (err: Error) => {
      lastError = err.message;
    });
    proc.on('exit', handleExit);

    if (!(await waitForReachable(startTimeoutMs))) {
      const timeoutError = new FreenetHostStartTimeoutError(freenetWsUrl(wsHost, wsPort), startTimeoutMs);
      stopping = true;
      try {
        proc.kill('SIGTERM');
      } catch {
        /* already gone */
      }
      stopping = false;
      child = null;
      mode = 'failed';
      lastError = timeoutError.message;
      emitState();
      throw timeoutError;
    }

    mode = 'managed';
    reachable = true;
    updateRequired = false;
    restartAttempts = 0;
    startedAt = new Date().toISOString();
    emitState();
    return snapshot();
  }

  function start(): Promise<FreenetHostStatus> {
    if (!startInFlight) {
      startInFlight = doStart().finally(() => {
        startInFlight = null;
      });
    }
    return startInFlight;
  }

  async function stop(): Promise<FreenetHostStatus> {
    stopping = true;

    if (mode === 'attached') {
      // Detach only — this node belongs to someone else.
      mode = 'stopped';
      reachable = false;
      stopping = false;
      emitState();
      return snapshot();
    }

    const proc = child;
    if (!proc) {
      mode = 'stopped';
      reachable = false;
      stopping = false;
      emitState();
      return snapshot();
    }

    const exited = new Promise<void>((resolve) => exitWaiters.push(resolve));
    try {
      proc.kill('SIGTERM');
    } catch {
      /* already gone */
    }

    let graceExpired = false;
    await Promise.race([exited, sleep(stopGraceMs).then(() => { graceExpired = true; })]);
    if (graceExpired && child) {
      try {
        proc.kill('SIGKILL');
      } catch {
        /* already gone */
      }
      await Promise.race([exited, sleep(1_000)]);
    }

    child = null;
    mode = 'stopped';
    reachable = false;
    stopping = false;
    emitState();
    return snapshot();
  }

  async function status(): Promise<FreenetHostStatus> {
    if (mode === 'managed' || mode === 'attached') {
      reachable = await probe(wsHost, wsPort, PROBE_TIMEOUT_MS);
    }
    return snapshot();
  }

  async function putCiphertext(
    bytes: Uint8Array,
    putOptions?: FreenetPutCiphertextOptions,
  ): Promise<FreenetPutCiphertextResult> {
    if (!options.wire) throw new FreenetWireUnavailableError('put ciphertext');
    return options.wire.putCiphertext(bytes, putOptions);
  }

  async function getCiphertext(uri: string): Promise<Uint8Array | null> {
    if (!options.wire) throw new FreenetWireUnavailableError('get ciphertext');
    return options.wire.getCiphertext(uri);
  }

  return {
    id: FREENET_HOST_ID,
    start,
    stop,
    status,
    putCiphertext,
    getCiphertext,
    on(listener: FreenetHostEventListener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Environment the mist transport expects, derived from a live host status.
 * `units/mist-freenet` reads these unchanged — see plan §5.5.
 */
export function freenetHostEnv(
  status: FreenetHostStatus,
  extras: { fdevBin?: string; packWasm?: string; mistRoot?: string } = {},
): Record<string, string> {
  const env: Record<string, string> = {
    FREENET_TRANSPORT: 'ws02',
    FREENET_WS_URL: status.wsUrl,
    FREENET_WS_PORT: String(status.wsPort),
  };
  if (extras.fdevBin) env.FDEV_BIN = extras.fdevBin;
  if (extras.packWasm) env.FREENET_PACK_WASM = extras.packWasm;
  if (extras.mistRoot) env.MIST_FREENET_ROOT = extras.mistRoot;
  return env;
}
