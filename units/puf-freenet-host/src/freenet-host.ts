/**
 * PUF Freenet Host — owns the lifecycle of a bundled `freenet` node.
 *
 * v1 is a **managed child process**, not a linked library: Freenet 0.2 ships as
 * a Rust binary with a loopback WebSocket API. The operator never installs,
 * configures, or sees it — PUF-AM starts and stops it. See
 * `Plans/reference/DESKTOP_FREENET_PLUGIN.md` §4.
 *
 * Node-only (`node:child_process`, `node:net`, `node:fs`). Never import from
 * renderer/browser code.
 */

import { spawn as nodeSpawn, execFile } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import {
  createFreenetContractTrafficEvent,
  mergeFreenetContractTraffic,
  slotKindFromStorageKey,
  type FreenetContractTrafficEvent,
} from './contract-traffic.ts';
import {
  FreenetHostStartTimeoutError,
  FreenetWireUnavailableError,
} from './errors.ts';
import {
  freenetPortNotFreenetMessage,
  identifyFreenet02Listener,
} from './identify-freenet02.ts';
import { leftoverAfterKillSwitch, maySignalAttachedListener } from './kill-switch.ts';
import { readFreenetLogPeerCount } from './log-peer-count.ts';
import { freenetPutReadyError, shouldEnforceFreenetPutReady } from './put-ready.ts';
import {
  attachKindFromListener,
  classifyFreenetListener,
  decidePortTakenMode,
  defaultHomeDir,
  inspectLoopbackListener,
} from './listener-owner.ts';
import { FREENET_BINARY, resolveFreenetBinary, resolveFreenetBinaryOrThrow } from './resolve-binary.ts';
import type {
  FreenetAttachKind,
  FreenetBinaryInfo,
  FreenetChildProcess,
  FreenetHostEvent,
  FreenetHostEventListener,
  FreenetHostMode,
  FreenetHostOptions,
  FreenetHostPlugin,
  FreenetHostStatus,
  FreenetHostStatusOptions,
  FreenetKillSwitchOptions,
  FreenetKillSwitchResult,
  FreenetLeftoverKind,
  FreenetListenerOwner,
  FreenetPutCiphertextOptions,
  FreenetPutCiphertextResult,
  FreenetSlotPutInput,
  FreenetSlotPutResult,
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

function defaultKillPid(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

function defaultStopUserService(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('systemctl', ['--user', 'stop', 'freenet.service'], { timeout: 8_000 }, (err) => {
      resolve(!err);
    });
  });
}

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
  // detached so Keep-on-quit can leave the node; --log-dir still gets the files.
  const child = nodeSpawn(binaryPath, args, {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: true,
  });
  try {
    child.unref();
  } catch {
    /* unref is best-effort */
  }
  return child;
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
  const identify = options.identify ?? identifyFreenet02Listener;
  const inspect = options.inspect ?? inspectLoopbackListener;
  const readVersion = options.readVersion ?? readFreenetVersion;
  const baseEnv = options.env ?? process.env;

  const configDir = path.resolve(options.configDir);
  const dataDir = path.resolve(options.dataDir);
  const logDir = path.resolve(options.logDir);

  const listeners = new Set<FreenetHostEventListener>();
  let mode: FreenetHostMode = 'stopped';
  let child: FreenetChildProcess | null = null;
  let adoptedPid: number | undefined;
  let attachKind: FreenetAttachKind | undefined;
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
  let contractTraffic: FreenetContractTrafficEvent[] = [];
  let leftover: FreenetLeftoverKind | undefined;
  let leftoverPackage: string | undefined;

  function rememberTraffic(event: FreenetContractTrafficEvent): void {
    contractTraffic = mergeFreenetContractTraffic([event, ...contractTraffic]);
  }

  function snapshot(): FreenetHostStatus {
    return {
      hostId: FREENET_HOST_ID,
      mode,
      reachable,
      wsUrl: freenetWsUrl(wsHost, wsPort),
      wsHost,
      wsPort,
      pid: mode === 'managed' ? child?.pid ?? adoptedPid : undefined,
      ...(mode === 'attached' && attachKind ? { attachKind } : {}),
      binary,
      configDir,
      dataDir,
      logDir,
      updateRequired,
      startedAt,
      lastExitCode,
      lastError,
      ...(contractTraffic.length ? { contractTraffic } : {}),
      ...(leftover && leftover !== 'none' ? { leftover, leftoverPackage } : {}),
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
    const args = [
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
    // Only when asked: the default 31337 is what NAT traversal and gateways expect,
    // so moving it costs connectivity. It exists for running beside another node.
    if (options.networkPort !== undefined) {
      args.push('--network-port', String(options.networkPort));
    }
    return args;
  }

  function settleExitWaiters(): void {
    const waiters = exitWaiters;
    exitWaiters = [];
    for (const waiter of waiters) waiter();
  }

  function handleExit(code: number | null, signal: NodeJS.Signals | null): void {
    child = null;
    adoptedPid = undefined;
    attachKind = undefined;
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

  async function looksLikeFreenet(): Promise<boolean> {
    return identify(wsHost, wsPort, PROBE_TIMEOUT_MS);
  }

  function peekBundledPath(): string | undefined {
    return resolveFreenetBinary(FREENET_BINARY, {
      binaryPath: options.binaryPath,
      searchPaths: options.binarySearchPaths,
      repoRoot: options.repoRoot,
      env: baseEnv,
    }).binary?.path;
  }

  async function listenOwner(): Promise<FreenetListenerOwner | null> {
    try {
      return (await inspect(wsHost, wsPort)) ?? null;
    } catch {
      return null;
    }
  }

  function markManaged(nextBinary?: FreenetBinaryInfo, pid?: number): void {
    mode = 'managed';
    attachKind = undefined;
    reachable = true;
    updateRequired = false;
    restartAttempts = 0;
    startedAt = startedAt ?? new Date().toISOString();
    lastError = undefined;
    if (nextBinary) binary = nextBinary;
    if (pid !== undefined) adoptedPid = pid;
  }

  function markAttached(kind: FreenetAttachKind, owner?: FreenetListenerOwner | null): void {
    mode = 'attached';
    attachKind = kind;
    reachable = true;
    startedAt = startedAt ?? new Date().toISOString();
    lastError = undefined;
    if (owner?.exe && !binary) {
      binary = { path: owner.exe, source: 'path' };
    }
  }

  async function waitForReachable(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!child) {
        // Process died while we were waiting — handleExit owns the state.
        return false;
      }
      // TCP is not enough: a leftover on :7509 would look like our child.
      if ((await probe(wsHost, wsPort, PROBE_TIMEOUT_MS)) && (await looksLikeFreenet())) {
        return true;
      }
      await sleep(PROBE_INTERVAL_MS);
    }
    return false;
  }

  async function doStart(): Promise<FreenetHostStatus> {
    if (mode === 'attached' && reachable) return snapshot();
    if (mode === 'managed' && (child || reachable)) {
      if (!reachable && child) {
        reachable = (await probe(wsHost, wsPort, PROBE_TIMEOUT_MS)) && (await looksLikeFreenet());
      }
      return snapshot();
    }

    stopping = false;
    mode = 'starting';
    lastError = undefined;
    leftover = undefined;
    leftoverPackage = undefined;
    emitState();

    const tcpUp = await probe(wsHost, wsPort, PROBE_TIMEOUT_MS);
    let occupiedNotFreenet = false;
    if (tcpUp) {
      if (await looksLikeFreenet()) {
        const owner = await listenOwner();
        const kind = classifyFreenetListener({
          owner,
          bundledPath: peekBundledPath(),
          ourChildPid: child?.pid ?? adoptedPid,
          ourUid: typeof process.getuid === 'function' ? process.getuid() : undefined,
          homeDir: defaultHomeDir(),
          configDir,
        });
        const decision = decidePortTakenMode({
          listenerKind: kind,
          hasChild: Boolean(child),
          recordedManaged: false,
          attachIfRunning,
        });
        if (decision === 'managed') {
          const bundled = peekBundledPath();
          markManaged(
            binary ?? (bundled ? { path: bundled, source: 'bundled' } : undefined),
            owner?.pid,
          );
          emitState();
          return snapshot();
        }
        if (decision === 'attached') {
          markAttached(attachKindFromListener(kind), owner);
          emitState();
          return snapshot();
        }
        mode = 'failed';
        lastError = `Port ${wsPort} already in use and attachIfRunning is false`;
        emitState();
        throw new Error(lastError);
      }
      // TCP answers but it is not Freenet 0.2. Do not attach. Still try to
      // start our node; if the occupant keeps the port, fail clean — do not kill it.
      occupiedNotFreenet = true;
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
      lastError = occupiedNotFreenet
        ? freenetPortNotFreenetMessage(wsHost, wsPort)
        : timeoutError.message;
      emitState();
      throw occupiedNotFreenet ? new Error(lastError) : timeoutError;
    }

    markManaged(binary, proc.pid);
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
      // Detach only — this node belongs to someone else. Never kill it.
      mode = 'stopped';
      attachKind = undefined;
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
    adoptedPid = undefined;
    attachKind = undefined;
    mode = 'stopped';
    reachable = false;
    leftover = undefined;
    leftoverPackage = undefined;
    stopping = false;
    emitState();
    return snapshot();
  }

  function signalListenerPid(pid: number | undefined): boolean {
    if (pid === undefined || !Number.isFinite(pid) || pid <= 0) return false;
    if (pid === process.pid) return false;
    try {
      return (options.killPid ?? defaultKillPid)(pid, 'SIGTERM');
    } catch {
      return false;
    }
  }

  async function classifyLiveListener() {
    const owner = await listenOwner();
    return {
      owner,
      kind: classifyFreenetListener({
        owner,
        bundledPath: peekBundledPath(),
        ourChildPid: child?.pid ?? adoptedPid,
        ourUid: typeof process.getuid === 'function' ? process.getuid() : undefined,
        homeDir: defaultHomeDir(),
        configDir,
      }),
    };
  }

  /**
   * Settings kill switch. Quit `stop()` stays managed-only.
   * Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-14 (kill switch).
   */
  async function stopAllOurs(input: FreenetKillSwitchOptions = {}): Promise<FreenetKillSwitchResult> {
    stopping = true;
    let stoppedOurs = false;

    if (child) {
      const exited = new Promise<void>((resolve) => exitWaiters.push(resolve));
      try {
        child.kill('SIGTERM');
        stoppedOurs = true;
      } catch {
        /* already gone */
      }
      let graceExpired = false;
      await Promise.race([exited, sleep(Math.min(stopGraceMs, 4_000)).then(() => { graceExpired = true; })]);
      if (graceExpired && child) {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already gone */
        }
        await Promise.race([exited, sleep(1_000)]);
      }
      child = null;
      adoptedPid = undefined;
    } else if (adoptedPid) {
      stoppedOurs = signalListenerPid(adoptedPid) || stoppedOurs;
      adoptedPid = undefined;
    }

    const live = await classifyLiveListener();
    if (maySignalAttachedListener(live.kind)) {
      stoppedOurs = signalListenerPid(live.owner?.pid) || stoppedOurs;
    }
    if (live.kind === 'login-leftover' && input.stopUserService) {
      try {
        const fn = options.stopUserService ?? defaultStopUserService;
        stoppedOurs = (await fn()) || stoppedOurs;
      } catch {
        /* service may already be gone */
      }
    }

    await sleep(400);
    const answered = await probe(wsHost, wsPort, PROBE_TIMEOUT_MS);
    const stillFreenet = answered && (await looksLikeFreenet());
    const after = stillFreenet ? await classifyLiveListener() : { owner: null, kind: 'unknown' as const };
    const nextLeftover = leftoverAfterKillSwitch({
      portStillFreenet: Boolean(stillFreenet),
      listenerKind: stillFreenet ? after.kind : null,
    });
    leftover = nextLeftover;
    leftoverPackage = undefined;
    attachKind = undefined;
    if (!stillFreenet) {
      mode = 'stopped';
      reachable = false;
    } else if (nextLeftover === 'ours') {
      mode = 'managed';
      reachable = true;
      if (after.owner?.pid) adoptedPid = after.owner.pid;
    } else {
      mode = 'attached';
      attachKind = nextLeftover === 'login-service' ? 'login-leftover' : 'foreign';
      reachable = true;
    }
    emitState();
    return {
      ...snapshot(),
      leftover: nextLeftover,
      portFree: !stillFreenet,
      stoppedOurs,
    };
  }

  /**
   * Leave a managed child running so the next PUF-AM can attach.
   * Never kills `attached`. Sets stopping so handleExit will not auto-restart.
   */
  async function release(): Promise<FreenetHostStatus> {
    stopping = true;
    if (mode === 'attached' || !child) {
      child = null;
      adoptedPid = undefined;
      attachKind = undefined;
      mode = 'stopped';
      reachable = false;
      emitState();
      return snapshot();
    }
    try {
      child.unref?.();
    } catch {
      /* already detached */
    }
    child = null;
    adoptedPid = undefined;
    attachKind = undefined;
    mode = 'stopped';
    reachable = false;
    emitState();
    return snapshot();
  }

  async function status(statusOptions?: FreenetHostStatusOptions): Promise<FreenetHostStatus> {
    // `start()` owns the probe loop while starting; a second prober would race it.
    if (mode === 'starting') return snapshot();

    const live = mode === 'managed' || mode === 'attached';
    if (!live && !statusOptions?.probe) return snapshot();

    const answered = await probe(wsHost, wsPort, PROBE_TIMEOUT_MS);
    const isFreenet = answered && (await looksLikeFreenet());

    if (mode === 'managed' || child) {
      // Never flip managed → attached just because :7509 answers.
      reachable = isFreenet;
      return snapshot();
    }

    if (mode === 'attached') {
      reachable = isFreenet;
      return snapshot();
    }

    if (isFreenet && attachIfRunning) {
      const owner = await listenOwner();
      const kind = classifyFreenetListener({
        owner,
        bundledPath: peekBundledPath(),
        ourChildPid: adoptedPid,
        ourUid: typeof process.getuid === 'function' ? process.getuid() : undefined,
        homeDir: defaultHomeDir(),
        configDir,
      });
      const decision = decidePortTakenMode({
        listenerKind: kind,
        hasChild: Boolean(child),
        recordedManaged: false,
        attachIfRunning,
      });
      if (decision === 'managed') {
        const bundled = peekBundledPath();
        markManaged(
          binary ?? (bundled ? { path: bundled, source: 'bundled' } : undefined),
          owner?.pid,
        );
      } else {
        markAttached(attachKindFromListener(kind), owner);
      }
      emitState();
    }

    return snapshot();
  }

  function assertPutReady(): void {
    if (
      !shouldEnforceFreenetPutReady({
        reachable,
        mode,
        hasChild: Boolean(child || adoptedPid),
      })
    ) {
      return;
    }
    const peerCount = readFreenetLogPeerCount(logDir)?.peerCount ?? 0;
    const readyError = freenetPutReadyError({ reachable, peerCount });
    if (readyError) throw new Error(readyError);
  }

  async function putCiphertext(
    bytes: Uint8Array,
    putOptions?: FreenetPutCiphertextOptions,
  ): Promise<FreenetPutCiphertextResult> {
    if (!options.wire) throw new FreenetWireUnavailableError('put ciphertext');
    assertPutReady();
    const result = await options.wire.putCiphertext(bytes, putOptions);
    rememberTraffic(
      createFreenetContractTrafficEvent({
        op: 'put',
        source: 'host',
        slotKind: slotKindFromStorageKey(putOptions?.identifier),
        contractKey: result.uri,
      }),
    );
    return result;
  }

  async function getCiphertext(uri: string): Promise<Uint8Array | null> {
    if (!options.wire) throw new FreenetWireUnavailableError('get ciphertext');
    const bytes = await options.wire.getCiphertext(uri);
    if (bytes?.length) {
      rememberTraffic(
        createFreenetContractTrafficEvent({
          op: 'get',
          source: 'host',
          contractKey: uri,
        }),
      );
    }
    return bytes;
  }

  async function putSlotState(input: FreenetSlotPutInput): Promise<FreenetSlotPutResult> {
    const put = options.wire?.putSlotState;
    if (!put) throw new FreenetWireUnavailableError('put slot state');
    assertPutReady();
    const result = await put.call(options.wire, input);
    rememberTraffic(
      createFreenetContractTrafficEvent({
        op: 'put',
        source: 'host',
        contractKey: result.uri || input.instanceIdBase58,
      }),
    );
    return result;
  }

  async function getSlotState(instanceIdBase58: string): Promise<Uint8Array | null> {
    const get = options.wire?.getSlotState;
    if (!get) throw new FreenetWireUnavailableError('get slot state');
    const bytes = await get.call(options.wire, instanceIdBase58);
    if (bytes?.length) {
      rememberTraffic(
        createFreenetContractTrafficEvent({
          op: 'get',
          source: 'host',
          contractKey: instanceIdBase58,
        }),
      );
    }
    return bytes;
  }

  return {
    id: FREENET_HOST_ID,
    start,
    stop,
    stopAllOurs,
    release,
    status,
    putCiphertext,
    getCiphertext,
    putSlotState,
    getSlotState,
    on(listener: FreenetHostEventListener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Environment the mist transport expects, derived from a live host status.
 * `units/mist-freenet` reads these unchanged — see plan §5.5. `FREENET_WS_URL`
 * is what both the flatbuffers GET and the native PUT clients open; the two
 * WASM paths are read off disk by the Node-side publish helpers, because a
 * bundled CJS main cannot derive them from `import.meta.url`.
 */
export function freenetHostEnv(
  status: FreenetHostStatus,
  extras: {
    packWasm?: string;
    /** Join-slot contract — what makes a short ticket resolve off the owner's Wi-Fi. */
    slotWasm?: string;
    mistRoot?: string;
  } = {},
): Record<string, string> {
  const env: Record<string, string> = {
    FREENET_WS_URL: status.wsUrl,
    FREENET_WS_PORT: String(status.wsPort),
  };
  if (extras.packWasm) env.FREENET_PACK_WASM = extras.packWasm;
  if (extras.slotWasm) env.FREENET_SLOT_WASM = extras.slotWasm;
  if (extras.mistRoot) env.MIST_FREENET_ROOT = extras.mistRoot;
  return env;
}
