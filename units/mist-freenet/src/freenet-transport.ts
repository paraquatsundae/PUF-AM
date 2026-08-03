/**
 * Freenet transport abstraction — phase 3 wire boundary.
 *
 * Implementations talk to a local Hyphanet/Freenet node (FCP) or an in-memory mock.
 */

export type FreenetConnectionStatus = 'connected' | 'disconnected' | 'connecting';

export type FreenetPutOptions = {
  /** Unique client-side request id; generated when omitted. */
  identifier?: string;
  /** When false, use minimal insert priority / no extra replication blocks. */
  contribute?: boolean;
};

export type FreenetPutResult = {
  uri: string;
  identifier: string;
};

export type FreenetTransportHealth = {
  status: FreenetConnectionStatus;
  host?: string;
  port?: number;
  nodeVersion?: string;
  /** `fcp` | `ws02` | `mock` — which wire backend is active. */
  transportId?: string;
  /** Full endpoint when useful (e.g. ws://127.0.0.1:7509/v1/contract/command). */
  endpoint?: string;
  lastError?: string;
};

export interface FreenetTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  /** Insert ciphertext bytes as a CHK block; returns the Freenet URI. */
  putBlob(data: Uint8Array, options?: FreenetPutOptions): Promise<FreenetPutResult>;

  /** Fetch bytes for a CHK (or other) URI; null when not found. */
  getBlob(uri: string, identifier?: string): Promise<Uint8Array | null>;

  health(): Promise<FreenetTransportHealth>;
}
