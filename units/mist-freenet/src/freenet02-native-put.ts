/**
 * Freenet 0.2 pack-contract PUT from a page — no `fdev`, no Node.
 *
 * GET already works over the stdlib flatbuffers path. Flatbuffers PUT hangs
 * on 0.2.11x (desktop still uses `fdev`). This client speaks the same native
 * bincode `fdev` uses on `encodingProtocol=native`.
 *
 * WASM is injected: this file must stay importable from a WebView.
 *
 * @see Plans/APK_FREENET_HOST.md §1
 */

import {
  ContractContainer,
  ContractKey,
  ContractType,
  PutRequest,
  WasmContractV1,
} from '@freenetorg/freenet-stdlib';
import { RelatedContractsT } from '@freenetorg/freenet-stdlib/client-request';
import { ContractCodeT } from '@freenetorg/freenet-stdlib/common';
import bs58 from 'bs58';

import { DEFAULT_LOCAL_FREENET_WS_URL } from './freenet02-browser-get-url.ts';
import {
  decodeNativeHostResult,
  encodeNativeAuthenticate,
  encodeNativeClose,
  encodeNativePackPut,
  toNativeFreenetWsUrl,
} from './freenet02-native-bincode.ts';
import {
  packContractCodeHashBytes,
  packContractInstanceId,
  packInstanceIdBase58,
  packParametersFromBlob,
} from './freenet02-pack-id.ts';
import { encodeFreenet02Uri } from './freenet02-uri.ts';

const DEFAULT_CONNECT_TIMEOUT_MS = 6_000;
/** SDK default is 30s; the hang was "never settles", so we cut it ourselves. */
export const NATIVE_PUT_DEFAULT_TIMEOUT_MS = 45_000;

export class FreenetNativePutError extends Error {
  /** True when the PUT did not settle before the hard timeout. */
  readonly hung: boolean;

  constructor(message: string, hung = false) {
    super(message);
    this.name = 'FreenetNativePutError';
    this.hung = hung;
  }
}

export type BrowserFreenetPutClientOptions = {
  wsUrl?: string;
  authToken?: string;
  connectTimeoutMs?: number;
  putTimeoutMs?: number;
  clientName?: string;
};

export type NativePackPutInput = {
  data: Uint8Array;
  /** Bundled pack-contract.wasm bytes (raw or fdev-packaged). */
  wasm: Uint8Array;
};

export type NativePackPutResult = {
  uri: string;
  instanceIdBase58: string;
  elapsedMs: number;
};

function toNumbers(bytes: Uint8Array): number[] {
  return Array.from(bytes);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function messageBytes(data: unknown): Promise<Uint8Array> {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data instanceof Uint8Array) return data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }
  throw new FreenetNativePutError('Freenet node sent a non-binary WebSocket frame');
}

/** Build the stdlib PutRequest the previous spike sent. Exported for hermetic tests. */
export function buildPackPutRequest(input: NativePackPutInput): {
  request: PutRequest;
  uri: string;
  instanceIdBase58: string;
} {
  const { data, wasm } = input;
  if (!wasm.byteLength) {
    throw new FreenetNativePutError('pack PUT needs the pack-contract WASM bytes');
  }

  const instanceIdBase58 = packInstanceIdBase58(data);
  const params = packParametersFromBlob(data);
  const codeHash = packContractCodeHashBytes();
  const instanceId = packContractInstanceId(codeHash, params);
  const key = new ContractKey(instanceId, codeHash);
  const code = new ContractCodeT(toNumbers(wasm), toNumbers(codeHash));
  const contract = new WasmContractV1(code, toNumbers(params), key);
  const container = new ContractContainer(ContractType.WasmContractV1, contract);
  const request = new PutRequest(container, toNumbers(data), new RelatedContractsT([]));

  return { request, uri: encodeFreenet02Uri(instanceIdBase58), instanceIdBase58 };
}

export class BrowserFreenetPutClient {
  readonly wsUrl: string;

  private readonly authToken: string;
  private readonly connectTimeoutMs: number;
  private readonly putTimeoutMs: number;

  constructor(options: BrowserFreenetPutClientOptions = {}) {
    this.wsUrl = toNativeFreenetWsUrl(options.wsUrl ?? DEFAULT_LOCAL_FREENET_WS_URL);
    this.authToken = options.authToken ?? '';
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.putTimeoutMs = options.putTimeoutMs ?? NATIVE_PUT_DEFAULT_TIMEOUT_MS;
  }

  isConnected(): boolean {
    return false;
  }

  async connect(): Promise<void> {
    /* Each put opens its own native socket. */
  }

  async disconnect(): Promise<void> {
    /* Nothing held open between puts. */
  }

  async putPackBlob(input: NativePackPutInput): Promise<NativePackPutResult> {
    const frame = encodeNativePackPut(input);
    const startedAt = Date.now();
    const socket = await this.openSocket();

    try {
      if (this.authToken) socket.send(encodeNativeAuthenticate(this.authToken));
      socket.send(frame.bytes);

      const reply = await this.readBinary(socket, this.putTimeoutMs);
      const decoded = decodeNativeHostResult(reply);
      if (!decoded.ok) {
        throw new FreenetNativePutError(
          `Freenet native PUT failed (${this.wsUrl}): ${decoded.message}`,
        );
      }
      if (!bytesEqual(decoded.instanceId, frame.instanceId)) {
        throw new FreenetNativePutError(
          'Freenet native PUT returned a different instance id than the frame we sent',
        );
      }

      const encoded = bs58.encode(decoded.instanceId);
      return {
        uri: encodeFreenet02Uri(encoded),
        instanceIdBase58: encoded,
        elapsedMs: Date.now() - startedAt,
      };
    } catch (error) {
      if (error instanceof FreenetNativePutError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const hung = /did not settle|request timeout/i.test(message);
      throw new FreenetNativePutError(
        `Freenet native PUT failed (${this.wsUrl}): ${message}`,
        hung,
      );
    } finally {
      this.closeSocket(socket);
    }
  }

  private openSocket(): Promise<WebSocket> {
    const Ctor = globalThis.WebSocket;
    if (!Ctor) {
      return Promise.reject(new FreenetNativePutError('WebSocket is not available in this runtime'));
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      let socket: WebSocket;
      try {
        socket = new Ctor(this.wsUrl);
      } catch (error) {
        reject(
          new FreenetNativePutError(error instanceof Error ? error.message : String(error)),
        );
        return;
      }

      const fail = (reason: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          socket.close();
        } catch {
          /* already gone */
        }
        reject(new FreenetNativePutError(reason));
      };

      const timer = setTimeout(() => {
        fail(`No Freenet node answered on ${this.wsUrl} within ${this.connectTimeoutMs}ms`);
      }, this.connectTimeoutMs);

      socket.binaryType = 'arraybuffer';
      socket.addEventListener('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(socket);
      });
      socket.addEventListener('error', () => {
        fail(`Freenet node WebSocket error (${this.wsUrl})`);
      });
      socket.addEventListener('close', (event) => {
        fail(
          `Freenet node closed the connection (${event.code}${event.reason ? ` ${event.reason}` : ''})`,
        );
      });
    });
  }

  private readBinary(socket: WebSocket, timeoutMs: number): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const finish = (action: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.removeEventListener('message', onMessage);
        socket.removeEventListener('error', onError);
        socket.removeEventListener('close', onClose);
        action();
      };

      const timer = setTimeout(() => {
        finish(() =>
          reject(
            new FreenetNativePutError(
              `native PUT did not settle in ${timeoutMs}ms — this is the 0.2.x hang the spike is measuring`,
              true,
            ),
          ),
        );
      }, timeoutMs);

      const onMessage = (event: MessageEvent) => {
        void messageBytes(event.data).then(
          (bytes) => finish(() => resolve(bytes)),
          (error) => finish(() => reject(error)),
        );
      };
      const onError = () => {
        finish(() =>
          reject(new FreenetNativePutError(`Freenet node WebSocket error (${this.wsUrl})`)),
        );
      };
      const onClose = (event: CloseEvent) => {
        finish(() =>
          reject(
            new FreenetNativePutError(
              `Freenet node closed before PUT answered (${event.code}${event.reason ? ` ${event.reason}` : ''})`,
            ),
          ),
        );
      };

      socket.addEventListener('message', onMessage);
      socket.addEventListener('error', onError);
      socket.addEventListener('close', onClose);
    });
  }

  private closeSocket(socket: WebSocket): void {
    try {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(encodeNativeClose());
      }
      socket.close();
    } catch {
      /* already gone */
    }
  }
}
