/**
 * In-memory Freenet transport for unit tests — simulates CHK put/get without a node.
 */

import { sha256Hex } from './hash.ts';
import type {
  FreenetConnectionStatus,
  FreenetPutOptions,
  FreenetPutResult,
  FreenetTransport,
  FreenetTransportHealth,
} from './freenet-transport.ts';

/** Deterministic fake CHK URI from content (test-only; not a real Freenet CHK). */
export function mockChkUriFromContent(data: Uint8Array): string {
  const hash = sha256Hex(data);
  return `CHK@${hash.slice(0, 43)},${hash.slice(43)},AAEC--8`;
}

export type MockFreenetTransportOptions = {
  host?: string;
  port?: number;
  /** Start disconnected until connect() — default false (connected). */
  startDisconnected?: boolean;
  /** When true, connect() rejects (simulates node down). */
  failConnect?: boolean;
};

export class MockFreenetTransport implements FreenetTransport {
  private readonly host: string;
  private readonly port: number;
  private connected: boolean;
  private readonly blobs = new Map<string, Uint8Array>();
  private readonly failConnect: boolean;
  private putCount = 0;
  private getCount = 0;

  constructor(options: MockFreenetTransportOptions = {}) {
    this.host = options.host ?? 'mock-freenet';
    this.port = options.port ?? 0;
    this.connected = !(options.startDisconnected ?? false);
    this.failConnect = options.failConnect ?? false;
  }

  async connect(): Promise<void> {
    if (this.failConnect) {
      throw new Error('MockFreenetTransport: connect refused');
    }
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async putBlob(data: Uint8Array, options: FreenetPutOptions = {}): Promise<FreenetPutResult> {
    if (!this.connected) {
      throw new Error('MockFreenetTransport: not connected');
    }
    const uri = mockChkUriFromContent(data);
    this.blobs.set(uri, new Uint8Array(data));
    this.putCount++;
    return { uri, identifier: options.identifier ?? `mock-put-${this.putCount}` };
  }

  async getBlob(uri: string): Promise<Uint8Array | null> {
    if (!this.connected) {
      throw new Error('MockFreenetTransport: not connected');
    }
    this.getCount++;
    const hit = this.blobs.get(uri);
    return hit ? new Uint8Array(hit) : null;
  }

  async health(): Promise<FreenetTransportHealth> {
    const status: FreenetConnectionStatus = this.connected ? 'connected' : 'disconnected';
    return {
      status,
      host: this.host,
      port: this.port,
      nodeVersion: 'MockFred,0.7,test,0',
      transportId: 'mock',
    };
  }

  /** Test helpers */
  getPutCount(): number {
    return this.putCount;
  }

  getGetCount(): number {
    return this.getCount;
  }

  hasUri(uri: string): boolean {
    return this.blobs.has(uri);
  }
}
