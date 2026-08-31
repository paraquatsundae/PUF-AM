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
  encodeNativePackPut,
  nativeHostPutErrorMessage,
  toNativeFreenetWsUrl,
} from './freenet02-native-bincode.ts';
import { FreenetNativeWsError, sendNativeRequest } from './freenet02-native-ws.ts';
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

    try {
      const reply = await sendNativeRequest({
        wsUrl: this.wsUrl,
        authToken: this.authToken || undefined,
        connectTimeoutMs: this.connectTimeoutMs,
        requestTimeoutMs: this.putTimeoutMs,
        frame: frame.bytes,
      });
      const decoded = decodeNativeHostResult(reply);
      if (!decoded.ok) {
        throw new FreenetNativePutError(
          `Freenet native PUT failed (${this.wsUrl}): ${nativeHostPutErrorMessage(decoded)}`,
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
      const hung = error instanceof FreenetNativeWsError && error.hung;
      const message = error instanceof Error ? error.message : String(error);
      throw new FreenetNativePutError(
        `Freenet native PUT failed (${this.wsUrl}): ${message}`,
        hung,
      );
    }
  }
}
