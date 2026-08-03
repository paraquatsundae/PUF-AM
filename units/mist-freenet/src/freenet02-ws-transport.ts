/**
 * Freenet 0.2 WebSocket transport — pack-contract put/get via local node WS API.
 *
 * Talks to `freenet network` on ws-api-port (default 7509), not Hyphanet FCP :9481.
 * Each blob is an immutable pack-contract instance (content-addressed via BLAKE3-32).
 */

import {
  ContractKey,
  FreenetWsApi,
  GetRequest,
  type ResponseHandler,
} from '@freenetorg/freenet-stdlib';

import { putBlobViaFdev } from './freenet02-fdev-put.ts';
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
  requestTimeoutMs?: number;
  clientName?: string;
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

  constructor(options: Freenet02WsTransportOptions = {}) {
    const raw = options.wsUrl ?? process.env.FREENET_WS_URL ?? DEFAULT_WS_URL;
    this.endpointMeta = parseWsEndpoint(raw);
    this.wsBaseUrl = this.endpointMeta.endpoint;
    this.authToken = options.authToken ?? process.env.FREENET_WS_AUTH ?? '';
    this.connectTimeoutMs = options.connectTimeoutMs ?? 8_000;
    this.clientName = options.clientName ?? 'PUF-AM-mist';
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
        await this.api.disconnect({ cause: `${this.clientName} disconnect` });
      } catch {
        /* ignore */
      }
    }
    this.api = null;
    this.connected = false;
  }

  async putBlob(data: Uint8Array, options: FreenetPutOptions = {}): Promise<FreenetPutResult> {
    await this.connect();
    // Flatbuffers PUT via SDK hangs on 0.2.118; fdev uses native WS encoding on the same node.
    return putBlobViaFdev(data, options);
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
