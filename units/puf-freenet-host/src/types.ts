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

export type FreenetHostStatus = {
  hostId: string;
  mode: FreenetHostMode;
  /** WebSocket API answered a TCP probe. */
  reachable: boolean;
  wsUrl: string;
  wsHost: string;
  wsPort: number;
  /** Set only in `managed` mode. */
  pid?: number;
  binary?: FreenetBinaryInfo;
  configDir: string;
  dataDir: string;
  logDir: string;
  /** Node exited 42 — Freenet wants an update. The host never updates itself. */
  updateRequired: boolean;
  startedAt?: string;
  lastExitCode?: number | null;
  lastError?: string;
};

export type FreenetHostEvent =
  | { type: 'state'; status: FreenetHostStatus }
  | { type: 'log'; stream: 'stdout' | 'stderr'; line: string }
  | { type: 'exit'; code: number | null; signal: string | null }
  | { type: 'update-required'; version?: string };

export type FreenetHostEventListener = (event: FreenetHostEvent) => void;

export type FreenetHostStatusOptions = {
  /**
   * Probe the WS port even while stopped or failed, attaching when a node answers.
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
};

export type FreenetSpawnFn = (
  binaryPath: string,
  args: string[],
  env: Record<string, string | undefined>,
) => FreenetChildProcess;

export type FreenetProbeFn = (host: string, port: number, timeoutMs: number) => Promise<boolean>;

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
  /** Use an already-running node instead of spawning a second one (default true). */
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
  readVersion?: FreenetVersionFn;
};
