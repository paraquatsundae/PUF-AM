/**
 * PUF Freenet Host — plugin contract.
 *
 * Freenet runs *inside* a PUF app: this unit owns the lifecycle of a bundled
 * `freenet` binary and exposes ciphertext put/get. It never sees plaintext and
 * never holds farm keys — sealing stays in `units/mist-freenet`.
 *
 * Deliberately has **no import of mist-freenet**: the wire client is injected.
 * This surface is the fork boundary for PUF-FN — keep it narrow.
 * Plan: `Plans/reference/DESKTOP_FREENET_PLUGIN.md` §5.
 */

import type { FreenetContractTrafficEvent } from './contract-traffic.ts';

/** Where a resolved binary came from — surfaced so the workshop knows what it tested. */
export type FreenetBinarySource = 'option' | 'env' | 'bundled' | 'vendor' | 'path';

export type FreenetBinaryInfo = {
  path: string;
  source: FreenetBinarySource;
  /** Best-effort `freenet --version` output; undefined when probing failed. */
  version?: string;
};

/**
 * `managed` — this host spawned the node and may stop it.
 * `attached` — a node was already listening; the host uses it but must not kill it.
 */
export type FreenetHostMode = 'stopped' | 'starting' | 'managed' | 'attached' | 'failed';

/**
 * Why `mode` is `attached`. `ours` is never stored — that stays `managed`.
 * `foreign` is the honest default (login leftover / unknown), not “older AppImage”.
 */
export type FreenetAttachKind = 'other-appimage' | 'login-leftover' | 'foreign';

/**
 * One Opennet neighbour, when the node's JSON status names it.
 * `location` is the 0–1 small-world ring coordinate — omit when the node
 * only reported an id or a count (Freenet 0.2.135 has no locations here).
 */
export type FreenetRingPeer = {
  id?: string;
  location?: number;
};

/**
 * Optional ring snapshot from a JSON status query (`GET /status` or `/v1/status`).
 * Absent when the node has no JSON route — do not invent peers to fill it.
 */
export type FreenetNodeRingInfo = {
  /** This node's ring coordinate, 0–1, when the JSON reports it. */
  location?: number;
  peers: FreenetRingPeer[];
  /** `peers.length` when the list is real; a reported count when only N is known. */
  peerCount: number;
  /**
   * `locations` — peers (or this node) have 0–1 coordinates.
   * `ids` — peer ids, no coordinates.
   * `count` — a number only.
   * `none` — JSON answered but named no neighbours (joining Opennet).
   * `unreported` — no JSON peer route yet (`GET /status` 404 on 0.2.135) and
   * no `ring_connections=` / `connection_count=` line in this bake's log.
   * Do not treat this as zero peers.
   */
  peerSource: 'locations' | 'ids' | 'count' | 'none' | 'unreported';
  nodeVersion?: string;
};

export type FreenetHostStatus = {
  hostId: string;
  mode: FreenetHostMode;
  /** Loopback answered as Freenet 0.2 (`/v1/version` or WS hello), not mere TCP. */
  reachable: boolean;
  wsUrl: string;
  wsHost: string;
  wsPort: number;
  /** Set only in `managed` mode. */
  pid?: number;
  /** Set only in `attached` — who held `:7509` before this bake started. */
  attachKind?: FreenetAttachKind;
  binary?: FreenetBinaryInfo;
  configDir: string;
  dataDir: string;
  logDir: string;
  /** Node exited 42 — Freenet wants an update. The host never updates itself. */
  updateRequired: boolean;
  startedAt?: string;
  lastExitCode?: number | null;
  lastError?: string;
  /**
   * Loopback JSON status when `GET /status` or `/v1/status` exists.
   * 0.2.135 has no such route — peer count then comes from this bake's
   * `--log-dir` (`ring_connections=` / `connection_count=`), not HTML.
   */
  nodeRing?: FreenetNodeRingInfo;
  /**
   * Last N this-node PUT/GET events (host callbacks + `--log-dir`).
   * Absent or empty = idle ring. Never invented hops.
   */
  contractTraffic?: FreenetContractTrafficEvent[];
  /**
   * After the Settings kill switch: what is still on `:7509`.
   * Omit or `none` when the port is free. Never invent android-node.
   */
  leftover?: FreenetLeftoverKind;
  leftoverPackage?: string;
};

/** Who still holds `:7509` after we stopped what is ours. */
export type FreenetLeftoverKind = 'none' | 'ours' | 'android-node' | 'login-service' | 'foreign';

export type FreenetKillSwitchOptions = {
  /**
   * Desktop only: `systemctl --user stop freenet.service` after a second
   * confirm. Never implied by a first tap.
   */
  stopUserService?: boolean;
};

export type FreenetKillSwitchResult = FreenetHostStatus & {
  leftover: FreenetLeftoverKind;
  leftoverPackage?: string;
  portFree: boolean;
  /** True when we signalled our child, `:freenet`, or a same-uid listener we own. */
  stoppedOurs: boolean;
};

export type FreenetHostEvent =
  | { type: 'state'; status: FreenetHostStatus }
  | { type: 'log'; stream: 'stdout' | 'stderr'; line: string }
  | { type: 'exit'; code: number | null; signal: string | null }
  | { type: 'update-required'; version?: string };

export type FreenetHostEventListener = (event: FreenetHostEvent) => void;

export type FreenetHostStatusOptions = {
  /**
   * Probe the WS port even while stopped or failed, attaching when a Freenet 0.2
   * node answers (`GET /v1/version` or WS hello — TCP alone is not enough).
   *
   * Off by default so a status read never touches the network for a host that
   * owns nothing. The workshop "Refresh node status" button turns it on: without
   * a probe, a node started outside this host (or after a failed start) can never
   * be noticed, and the button looks broken.
   */
  probe?: boolean;
};

export type FreenetPutCiphertextOptions = {
  identifier?: string;
};

export type FreenetPutCiphertextResult = {
  uri: string;
  identifier?: string;
};

/**
 * A mutable slot — a contract whose address stays put while its state changes.
 *
 * The host does not know what a slot is for. PUF-AM uses one for the short join
 * ticket: the page derives the address, signs and seals the state, and hands
 * over bytes the host cannot read or forge (`Plans/NETWORK_PACK_PLUGIN.md`
 * § Host capability). Added 2026-09-11 for `Plans/FREENET_NETWORK_PACK.md`
 * decision 2 — additive; `putCiphertext` / `getCiphertext` are unchanged.
 */
export type FreenetSlotPutInput = {
  /** Contract parameters — fix the slot's address. */
  parameters: Uint8Array;
  /** Signed, sealed state. Whole state, not a delta. */
  state: Uint8Array;
  /** Base58 instance id the caller derived for these parameters. */
  instanceIdBase58: string;
};

export type FreenetSlotPutResult = {
  /** Wire URI for the slot instance — stable across re-publishes. */
  uri: string;
  instanceIdBase58: string;
  /** `put` on a first publish, `update` when the node already had the slot. */
  mode: 'put' | 'update';
};

/**
 * Injected by the host app (PUF-AM wraps `Freenet02WsTransport`). Keeps this
 * unit free of mist crypto and pack-contract details.
 *
 * The slot pair is optional: a wire without it makes the host's slot methods
 * throw `FreenetWireUnavailableError`, the same as a missing wire does for blobs.
 */
export type FreenetWireClient = {
  putCiphertext(
    bytes: Uint8Array,
    options?: FreenetPutCiphertextOptions,
  ): Promise<FreenetPutCiphertextResult>;
  getCiphertext(uri: string): Promise<Uint8Array | null>;
  putSlotState?(input: FreenetSlotPutInput): Promise<FreenetSlotPutResult>;
  getSlotState?(instanceIdBase58: string): Promise<Uint8Array | null>;
};

export interface FreenetHostPlugin {
  readonly id: string;
  start(): Promise<FreenetHostStatus>;
  stop(): Promise<FreenetHostStatus>;
  /**
   * Settings kill switch: stop our managed child and a `:7509` listener that
   * is ours. Does not force-stop Freenet Android Node. Quit `stop()` stays
   * managed-only.
   */
  stopAllOurs?(options?: FreenetKillSwitchOptions): Promise<FreenetKillSwitchResult>;
  /**
   * Forget a managed child without killing it (next PUF-AM attaches).
   * `attached`: bookkeeping only — never kill a node we did not start.
   */
  release?(): Promise<FreenetHostStatus>;
  status(options?: FreenetHostStatusOptions): Promise<FreenetHostStatus>;
  putCiphertext(
    bytes: Uint8Array,
    options?: FreenetPutCiphertextOptions,
  ): Promise<FreenetPutCiphertextResult>;
  getCiphertext(uri: string): Promise<Uint8Array | null>;
  /**
   * Publish or refresh a slot's state. Optional on the interface so an adapter
   * built before 2026-09-11 still type-checks; `createFreenetHost` always
   * provides it and throws `FreenetWireUnavailableError` when the wire cannot.
   */
  putSlotState?(input: FreenetSlotPutInput): Promise<FreenetSlotPutResult>;
  /** Current state of a slot, or `null` when no peer has it yet. */
  getSlotState?(instanceIdBase58: string): Promise<Uint8Array | null>;
  /** Subscribe to lifecycle/log events. Returns an unsubscribe function. */
  on(listener: FreenetHostEventListener): () => void;
}

/** Minimal child-process shape the host needs — keeps `spawn` injectable in tests. */
export type FreenetChildProcess = {
  pid?: number;
  stdout: { on(event: 'data', listener: (chunk: unknown) => void): unknown } | null;
  stderr: { on(event: 'data', listener: (chunk: unknown) => void): unknown } | null;
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
  kill(signal?: NodeJS.Signals): boolean;
  /** Present on a real `ChildProcess` — used so Keep-on-quit can orphan the node. */
  unref?(): void;
};

export type FreenetSpawnFn = (
  binaryPath: string,
  args: string[],
  env: Record<string, string | undefined>,
) => FreenetChildProcess;

export type FreenetProbeFn = (host: string, port: number, timeoutMs: number) => Promise<boolean>;

/** True when the listener is Freenet 0.2 — not a leftover HTTP dashboard. */
export type FreenetIdentifyFn = (host: string, port: number, timeoutMs: number) => Promise<boolean>;

/** Who owns the WS listen socket — tests inject this; default is Linux `/proc`. */
export type FreenetListenerOwner = {
  pid?: number;
  uid?: number;
  exe?: string;
  cwd?: string;
  cmdline?: string;
};

export type FreenetInspectFn = (
  host: string,
  port: number,
) => Promise<FreenetListenerOwner | null> | FreenetListenerOwner | null;

export type FreenetVersionFn = (binaryPath: string) => Promise<string | undefined>;

export type FreenetHostOptions = {
  /** App-owned directories — `--config-dir` / `--data-dir` / `--log-dir`. */
  configDir: string;
  dataDir: string;
  logDir: string;
  /** Loopback by default; the node must not be exposed beyond this machine. */
  wsHost?: string;
  wsPort?: number;
  /**
   * Freenet's peer-to-peer UDP port (`--network-port`, default 31337). Leave unset
   * in production — the default is what NAT traversal and gateways expect. Set it
   * only to run a second node beside an existing one, which otherwise contends for
   * the same socket even though the WS API ports differ.
   */
  networkPort?: number;
  /** `network` = Opennet (default). `local` is dev-only and joins no network. */
  networkMode?: 'network' | 'local';
  /** Explicit binary path — highest precedence in resolution. */
  binaryPath?: string;
  /** Extra directories to search, e.g. Electron `${process.resourcesPath}/freenet`. */
  binarySearchPaths?: string[];
  /** Enables the `vendor/freenet/<os>-<arch>/` dev lookup (plan §5.3 step 4). */
  repoRoot?: string;
  /**
   * Use an already-running Freenet 0.2 node instead of spawning a second one
   * (default true). Attach only after identify; do not kill a verified Freenet.
   */
  attachIfRunning?: boolean;
  /** Restart the managed node after an unexpected exit (default true). */
  autoRestart?: boolean;
  maxRestartAttempts?: number;
  /** How long to wait for the WS port to open after spawn (default 45 s). */
  startTimeoutMs?: number;
  /** Grace period between SIGTERM and SIGKILL on stop (default 8 s). */
  stopGraceMs?: number;
  /** Ciphertext put/get. Omit and both throw `FreenetWireUnavailableError`. */
  wire?: FreenetWireClient;
  env?: Record<string, string | undefined>;
  spawn?: FreenetSpawnFn;
  probe?: FreenetProbeFn;
  /** Default: GET /v1/version or WS hello. Tests must inject this — do not hit a live :7509. */
  identify?: FreenetIdentifyFn;
  /** Default: Linux `/proc`. Tests inject a stub — do not scan a live :7509. */
  inspect?: FreenetInspectFn;
  readVersion?: FreenetVersionFn;
  /** Tests inject — default `process.kill`. Never aimed at this Electron pid. */
  killPid?: (pid: number, signal: NodeJS.Signals) => boolean;
  /** Tests inject — default `systemctl --user stop freenet.service`. */
  stopUserService?: () => Promise<boolean>;
};
