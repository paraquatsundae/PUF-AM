/**
 * FCPv2 client over TCP — talks to a local Hyphanet/Freenet node.
 *
 * Node-only (`node:net`). Default FCP port 9481 on localhost.
 */

import { connect, type Socket } from 'node:net';

import {
  encodeClientGet,
  encodeClientHello,
  encodeClientPutDirect,
  parseFcpStream,
  type FcpMessage,
} from './fcp-protocol.ts';
import type {
  FreenetConnectionStatus,
  FreenetPutOptions,
  FreenetPutResult,
  FreenetTransport,
  FreenetTransportHealth,
} from './freenet-transport.ts';

export type FcpFreenetTransportOptions = {
  host?: string;
  port?: number;
  clientName?: string;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
};

type PendingRequest = {
  resolve: (msg: FcpMessage) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class FcpFreenetTransport implements FreenetTransport {
  private readonly host: string;
  private readonly port: number;
  private readonly clientName: string;
  private readonly connectTimeoutMs: number;
  private readonly requestTimeoutMs: number;

  private socket: Socket | null = null;
  private parseState = { buffer: new Uint8Array(0) };
  private handshakeDone = false;
  private nodeVersion: string | undefined;
  private connecting: Promise<void> | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private nextId = 0;
  private dispatchFn: (message: FcpMessage) => void;

  constructor(options: FcpFreenetTransportOptions = {}) {
    this.host = options.host ?? process.env.FREENET_FCP_HOST ?? '127.0.0.1';
    this.port = options.port ?? Number(process.env.FREENET_FCP_PORT ?? 9481);
    this.clientName = options.clientName ?? 'PUF-AM-mist';
    this.connectTimeoutMs = options.connectTimeoutMs ?? 5_000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 120_000;
    this.dispatchFn = (message) => this.dispatchMessage(message);
  }

  isConnected(): boolean {
    return this.handshakeDone && this.socket !== null && !this.socket.destroyed;
  }

  async connect(): Promise<void> {
    if (this.isConnected()) return;
    if (this.connecting) return this.connecting;

    this.connecting = this.openSocket();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  async disconnect(): Promise<void> {
    for (const [id, req] of this.pending) {
      clearTimeout(req.timer);
      req.reject(new Error('FCP disconnected'));
      this.pending.delete(id);
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.handshakeDone = false;
    this.parseState = { buffer: new Uint8Array(0) };
  }

  async putBlob(data: Uint8Array, options: FreenetPutOptions = {}): Promise<FreenetPutResult> {
    await this.connect();
    const identifier = options.identifier ?? this.nextIdentifier('put');
    const contribute = options.contribute ?? true;

    const fields: Record<string, string> = {
      URI: 'CHK@',
      'Metadata.ContentType': 'application/octet-stream',
      Identifier: identifier,
      Verbosity: '0',
      MaxRetries: contribute ? '10' : '3',
      PriorityClass: contribute ? '2' : '6',
      GetCHKOnly: 'false',
      Global: 'false',
      DontCompress: 'true',
      CompatibilityMode: 'COMPAT_CURRENT',
      ExtraInsertsSingleBlock: contribute ? '2' : '0',
    };

    const payload = encodeClientPutDirect(fields, data);
    this.socket!.write(payload);

    const success = await this.waitFor(identifier, ['PutSuccessful', 'PutFailed'], this.requestTimeoutMs);
    if (success.name === 'PutFailed') {
      const code = success.fields.Code ?? success.fields.Description ?? 'unknown';
      throw new Error(`FCP PutFailed: ${code}`);
    }
    const uri = success.fields.URI;
    if (!uri) throw new Error('FCP PutSuccessful missing URI');
    return { uri, identifier };
  }

  async getBlob(uri: string, identifier?: string): Promise<Uint8Array | null> {
    await this.connect();
    const id = identifier ?? this.nextIdentifier('get');

    const msg = encodeClientGet({
      URI: uri,
      Identifier: id,
      Verbosity: '0',
      ReturnType: 'direct',
      MaxRetries: '10',
      PriorityClass: '2',
      Global: 'false',
      IgnoreDS: 'false',
      DSOnly: 'false',
    });
    this.socket!.write(msg);

    const terminal = await this.waitFor(id, ['AllData', 'GetFailed', 'DataNotFound'], this.requestTimeoutMs);
    if (terminal.name === 'GetFailed' || terminal.name === 'DataNotFound') {
      return null;
    }
    if (!terminal.data) throw new Error('FCP AllData missing payload');
    return terminal.data;
  }

  async health(): Promise<FreenetTransportHealth> {
    let status: FreenetConnectionStatus = 'disconnected';
    if (this.connecting) status = 'connecting';
    else if (this.isConnected()) status = 'connected';

    return {
      status,
      host: this.host,
      port: this.port,
      nodeVersion: this.nodeVersion,
    };
  }

  private nextIdentifier(prefix: string): string {
    this.nextId += 1;
    return `${prefix}-${Date.now()}-${this.nextId}`;
  }

  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host: this.host, port: this.port });
      this.socket = socket;

      const onConnectTimeout = setTimeout(() => {
        socket.destroy();
        reject(new Error(`FCP connect timeout (${this.host}:${this.port})`));
      }, this.connectTimeoutMs);

      socket.once('connect', () => {
        clearTimeout(onConnectTimeout);
        socket.write(encodeClientHello(this.clientName));
      });

      socket.on('data', (chunk: Buffer) => {
        const buf = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        const { messages, state } = parseFcpStream(this.parseState, buf);
        this.parseState = state;
        for (const message of messages) {
          if (!this.handshakeDone && message.name === 'NodeHello') {
            this.nodeVersion = message.fields.Version;
            this.handshakeDone = true;
            resolve();
          }
          this.dispatchFn(message);
        }
      });

      socket.once('error', (err) => {
        clearTimeout(onConnectTimeout);
        this.handshakeDone = false;
        reject(err);
      });

      socket.once('close', () => {
        this.handshakeDone = false;
        this.socket = null;
      });

      setTimeout(() => {
        if (!this.handshakeDone) {
          socket.destroy();
          reject(new Error('FCP NodeHello timeout'));
        }
      }, this.connectTimeoutMs);
    });
  }

  private dispatchMessage(message: FcpMessage): void {
    const id = message.fields.Identifier ?? message.fields.GlobalRequestIdentifier;
    if (!id) return;

    const pending = this.pending.get(id);
    if (!pending) return;

    if (message.name === 'PersistentGet' || message.name === 'PersistentPut') {
      return;
    }
    if (message.name === 'DataFound') {
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(id);
    pending.resolve(message);
  }

  private waitFor(identifier: string, accept: string[], timeoutMs: number): Promise<FcpMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(identifier);
        reject(new Error(`FCP timeout waiting for ${accept.join('|')} (${identifier})`));
      }, timeoutMs);

      this.pending.set(identifier, {
        resolve: (msg) => {
          if (accept.includes(msg.name)) resolve(msg);
          else reject(new Error(`FCP unexpected ${msg.name} for ${identifier}`));
        },
        reject,
        timer,
      });
    });
  }
}
