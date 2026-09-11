/**
 * Freenet 0.2 WebSocket transport — pack-contract put/get against the node's
 * WS API (`freenet network`, ws-api-port 7509 by default). Node-only: this is
 * what `server/freenetHostWire.ts` and the Express relay's `FreenetPeer` use.
 *
 * Each blob is an immutable pack-contract instance (content-addressed via
 * BLAKE3-32). GET rides `@freenetorg/freenet-stdlib`'s flatbuffers API on a
 * held-open socket; PUT rides `BrowserFreenetPutClient` — the app's own native
 * bincode client, one short-lived socket per put — because flatbuffers PUT
 * hangs on 0.2.x (Plans/APK_FREENET_HOST.md §1 spike log). Since Phase 2 of
 * Plans/FREENET_NETWORK_PACK.md (decision 1) that native client is the only
 * publish path; no CLI is spawned.
 */

import {
  ContractKey,
  DisconnectRequest,
  FreenetWsApi,
  GetRequest,
  type ResponseHandler,
} from '@freenetorg/freenet-stdlib';

import { BrowserFreenetPutClient } from './freenet02-native-put.ts';
import type { NativeWebSocketConstructor } from './freenet02-native-ws.ts';
import { loadPackContractWasm } from './freenet02-pack.ts';
import { parseFreenet02Uri } from './freenet02-uri.ts';
import type {
  FreenetConnectionStatus,
  FreenetPutOptions,
  FreenetPutResult,
  FreenetTransport,
  FreenetTransportHealth,
} from './freenet-transport.ts';

export type Freenet02WsTransportOptions = {
  wsUrl?: string;
  authToken?: string;
  connectTimeoutMs?: number;
  /** Ceiling for one native PUT before it is reported as hung. */
  requestTimeoutMs?: number;
  clientName?: string;
  /** Socket class for the native PUT; defaults to the runtime's `globalThis.WebSocket`. */
  webSocket?: NativeWebSocketConstructor;
  /** Tests: pack-contract WASM bytes instead of the disk read. */
  packWasm?: Uint8Array;
};

const DEFAULT_WS_URL = 'ws://127.0.0.1:7509/v1/contract/command';

function noopHandler(): ResponseHandler {
  return {
    onContractPut: () => {},
    onContractGet: () => {},
    onContractUpdate: () => {},
    onContractUpdateNotification: () => {},
    onContractNotFound: () => {},
    onDelegateResponse: () => {},
    onErr: () => {},
    onOpen: () => {},
  };
}

function parseWsEndpoint(raw: string): { host: string; port: number; endpoint: string } {
  const url = new URL(raw.includes('://') ? raw : `ws://${raw}`);
  const host = url.hostname || '127.0.0.1';
  const port = url.port ? Number(url.port) : url.protocol === 'wss:' ? 443 : 7509;
  const path = url.pathname && url.pathname !== '/' ? url.pathname : '/v1/contract/command';
  const endpoint = `${url.protocol}//${host}${url.port ? `:${url.port}` : ''}${path}`;
  return { host, port, endpoint };
}

export class Freenet02WsTransport implements FreenetTransport {
  readonly transportId = 'ws02';
  private readonly wsBaseUrl: string;
  private readonly authToken: string;
  private readonly connectTimeoutMs: number;
  private readonly clientName: string;

  private api: FreenetWsApi | null = null;
  private connected = false;
  private connecting: Promise<void> | null = null;
  private lastError: string | undefined;
  private readonly endpointMeta: ReturnType<typeof parseWsEndpoint>;
  private readonly putClient: BrowserFreenetPutClient;
  private readonly packWasm: Uint8Array | undefined;

  constructor(options: Freenet02WsTransportOptions = {}) {
    const raw = options.wsUrl ?? process.env.FREENET_WS_URL ?? DEFAULT_WS_URL;
    this.endpointMeta = parseWsEndpoint(raw);
    this.wsBaseUrl = this.endpointMeta.endpoint;
    this.authToken = options.authToken ?? process.env.FREENET_WS_AUTH ?? '';
    this.connectTimeoutMs = options.connectTimeoutMs ?? 8_000;
    this.clientName = options.clientName ?? 'PUF-AM-mist';
    this.packWasm = options.packWasm;
    this.putClient = new BrowserFreenetPutClient({
      wsUrl: this.wsBaseUrl,
      authToken: this.authToken,
      connectTimeoutMs: this.connectTimeoutMs,
      putTimeoutMs: options.requestTimeoutMs,
      webSocket: options.webSocket,
    });
  }

  isConnected(): boolean {
    return this.connected && this.api !== null;
  }

  async connect(): Promise<void> {
    if (this.isConnected()) return;
    if (this.connecting) return this.connecting;

    this.connecting = this.openApi();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  async disconnect(): Promise<void> {
    if (this.api) {
      try {
        await this.api.disconnect(new DisconnectRequest(`${this.clientName} disconnect`));
      } catch {
        /* ignore */
      }
    }
    this.api = null;
    this.connected = false;
  }

  /**
   * Native bincode PUT of one pack-contract instance. The flatbuffers `api` is
   * not involved: the put opens its own `encodingProtocol=native` socket to the
   * same node, so a node that answers GET but refuses PUT fails here with the
   * node's reason rather than timing out inside the SDK.
   */
  async putBlob(data: Uint8Array, options: FreenetPutOptions = {}): Promise<FreenetPutResult> {
    const identifier = options.identifier ?? `native-put-${Date.now()}`;
    const wasm = this.packWasm ?? (await loadPackContractWasm());
    try {
      const result = await this.putClient.putPackBlob({ data, wasm });
      this.lastError = undefined;
      return { uri: result.uri, identifier };
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async getBlob(uri: string, _identifier?: string): Promise<Uint8Array | null> {
    const instanceId = parseFreenet02Uri(uri);
    if (!instanceId) {
      throw new Error(`Freenet 0.2 getBlob: not an FN02 URI (${uri.slice(0, 32)}…)`);
    }

    await this.connect();
    const key = ContractKey.fromInstanceId(instanceId);

    try {
      const response = await this.api!.get(new GetRequest(key, false, false, false));
      if (!response.state?.length) return null;
      return new Uint8Array(response.state);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/not found|Contract not found/i.test(msg)) return null;
      throw new Error(`Freenet 0.2 GET failed: ${msg}`);
    }
  }

  async health(): Promise<FreenetTransportHealth> {
    let status: FreenetConnectionStatus = 'disconnected';
    if (this.connecting) status = 'connecting';
    else if (this.isConnected()) status = 'connected';

    return {
      status,
      host: this.endpointMeta.host,
      port: this.endpointMeta.port,
      nodeVersion: this.connected ? 'Freenet-0.2-ws' : undefined,
      transportId: this.transportId,
      endpoint: this.wsBaseUrl,
      lastError: this.lastError,
    };
  }

  private openApi(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.wsBaseUrl);
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.api = null;
        this.connected = false;
        this.lastError = `WebSocket connect timeout (${this.wsBaseUrl})`;
        reject(new Error(this.lastError));
      }, this.connectTimeoutMs);

      const handler: ResponseHandler = {
        ...noopHandler(),
        onOpen: () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.connected = true;
          this.lastError = undefined;
          resolve();
        },
        onErr: (err) => {
          this.lastError = err.cause;
        },
        onClose: (code, reason) => {
          this.connected = false;
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            this.lastError = `WebSocket closed (${code} ${reason})`;
            reject(new Error(this.lastError));
          }
        },
      };

      try {
        this.api = new FreenetWsApi(url, handler, this.authToken || undefined);
      } catch (err) {
        clearTimeout(timer);
        settled = true;
        const msg = err instanceof Error ? err.message : String(err);
        this.lastError = msg;
        reject(err);
      }
    });
  }
}
