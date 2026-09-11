/**
 * Join-slot PUT / UPDATE — the app's own client, on every shell.
 *
 * Same native bincode as pack PUT. A slot address does not move when its
 * contents do, so a re-send has to reach the same instance: this tries PUT
 * first and, when the node answers that the contract already exists, sends
 * `UpdateData::State` with the **real** code hash (a zero hash misses the
 * instance — `missing contract` on 0.2.125). Since Phase 2 of
 * Plans/FREENET_NETWORK_PACK.md (decision 1) this is the only slot publish
 * path: `server/freenetSlotOps.ts` calls it for the host wire and the relay.
 *
 * WASM and the WebSocket class are injected. The caller hands over
 * already-signed state — this file is a byte mover, so FarmSeed never reaches it.
 *
 * @see Plans/APK_FREENET_HOST.md §1 (spike GO, node 0.2.125, 2026-08-15)
 */

import bs58 from 'bs58';

import { DEFAULT_LOCAL_FREENET_WS_URL } from './freenet02-browser-get-url.ts';
import {
  decodeNativeHostResult,
  encodeNativeContractPut,
  encodeNativeContractUpdate,
  looksLikeAlreadyPublished,
  nativeHostPutErrorMessage,
  toNativeFreenetWsUrl,
} from './freenet02-native-bincode.ts';
import {
  FreenetNativeWsError,
  sendNativeRequest,
  type NativeWebSocketConstructor,
} from './freenet02-native-ws.ts';
import { unpackContractWasm } from './freenet02-pack-id.ts';
import {
  JOIN_SLOT_HEADER_BYTES,
  JOIN_SLOT_MAGIC,
  JOIN_SLOT_PARAMETERS_BYTES,
} from './freenet02-slot.ts';
import { encodeFreenet02Uri } from './freenet02-uri.ts';

const DEFAULT_CONNECT_TIMEOUT_MS = 6_000;
export const NATIVE_SLOT_DEFAULT_TIMEOUT_MS = 45_000;

export class FreenetNativeSlotError extends Error {
  readonly hung: boolean;

  constructor(message: string, hung = false) {
    super(message);
    this.name = 'FreenetNativeSlotError';
    this.hung = hung;
  }
}

export type BrowserFreenetSlotClientOptions = {
  wsUrl?: string;
  authToken?: string;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
  /** Socket class; defaults to the runtime's `globalThis.WebSocket`. */
  webSocket?: NativeWebSocketConstructor;
};

export type NativeSlotPutInput = {
  parameters: Uint8Array;
  state: Uint8Array;
  /** Base58 instance id the caller derived — used for the update fallback. */
  instanceIdBase58: string;
  /** Bundled slot-contract.wasm bytes (raw, or with the upstream package header). */
  wasm: Uint8Array;
};

export type NativeSlotPutResult = {
  uri: string;
  instanceIdBase58: string;
  mode: 'put' | 'update';
};

function assertSlotShape(parameters: Uint8Array, state: Uint8Array): void {
  if (parameters.length !== JOIN_SLOT_PARAMETERS_BYTES) {
    throw new FreenetNativeSlotError(
      `slot put: parameters must be ${JOIN_SLOT_PARAMETERS_BYTES} bytes (slot id + verifying key), got ${parameters.length}`,
    );
  }
  if (state.length < JOIN_SLOT_HEADER_BYTES) {
    throw new FreenetNativeSlotError(
      `slot put: state must be at least ${JOIN_SLOT_HEADER_BYTES} bytes, got ${state.length}`,
    );
  }
  for (let i = 0; i < JOIN_SLOT_MAGIC.length; i++) {
    if (state[i] !== JOIN_SLOT_MAGIC[i]) {
      throw new FreenetNativeSlotError(
        'slot put: state is not a PUFSLOT1 slot state — refusing to publish it',
      );
    }
  }
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export class BrowserFreenetSlotClient {
  readonly wsUrl: string;

  private readonly authToken: string;
  private readonly connectTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly webSocket: NativeWebSocketConstructor | undefined;

  constructor(options: BrowserFreenetSlotClientOptions = {}) {
    this.wsUrl = toNativeFreenetWsUrl(options.wsUrl ?? DEFAULT_LOCAL_FREENET_WS_URL);
    this.authToken = options.authToken ?? '';
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.requestTimeoutMs = options.requestTimeoutMs ?? NATIVE_SLOT_DEFAULT_TIMEOUT_MS;
    this.webSocket = options.webSocket;
  }

  async updateJoinSlot(input: {
    instanceIdBase58: string;
    state: Uint8Array;
    /** Real code hash — required by the node; a zero hash comes back `missing contract`. */
    codeHash?: Uint8Array;
    wasm?: Uint8Array;
  }): Promise<NativeSlotPutResult> {
    if (input.state.length < JOIN_SLOT_HEADER_BYTES) {
      throw new FreenetNativeSlotError(
        `slot update: state must be at least ${JOIN_SLOT_HEADER_BYTES} bytes, got ${input.state.length}`,
      );
    }
    for (let i = 0; i < JOIN_SLOT_MAGIC.length; i++) {
      if (input.state[i] !== JOIN_SLOT_MAGIC[i]) {
        throw new FreenetNativeSlotError(
          'slot update: state is not a PUFSLOT1 slot state — refusing to publish it',
        );
      }
    }

    let instanceId: Uint8Array;
    try {
      instanceId = bs58.decode(input.instanceIdBase58);
    } catch {
      throw new FreenetNativeSlotError('slot update: instance id is not valid base58');
    }
    if (instanceId.byteLength !== 32) {
      throw new FreenetNativeSlotError('slot update: instance id must decode to 32 bytes');
    }

    const codeHash = input.codeHash ?? (input.wasm ? unpackContractWasm(input.wasm).codeHash : undefined);
    if (!codeHash) {
      throw new FreenetNativeSlotError(
        'slot update needs the contract WASM or code hash — a zero hash misses the instance on 0.2.125',
      );
    }

    try {
      const reply = await this.request(
        encodeNativeContractUpdate({ instanceId, state: input.state, codeHash }),
      );
      const decoded = decodeNativeHostResult(reply);
      if (!decoded.ok) {
        throw new FreenetNativeSlotError(
          `Freenet native slot UPDATE failed (${this.wsUrl}): ${nativeHostPutErrorMessage(decoded)}`,
        );
      }
      return {
        uri: encodeFreenet02Uri(input.instanceIdBase58),
        instanceIdBase58: input.instanceIdBase58,
        mode: 'update',
      };
    } catch (error) {
      if (error instanceof FreenetNativeSlotError) throw error;
      const hung = error instanceof FreenetNativeWsError && error.hung;
      const message = error instanceof Error ? error.message : String(error);
      throw new FreenetNativeSlotError(
        `Freenet native slot UPDATE failed (${this.wsUrl}): ${message}`,
        hung,
      );
    }
  }

  async putJoinSlot(input: NativeSlotPutInput): Promise<NativeSlotPutResult> {
    assertSlotShape(input.parameters, input.state);

    const frame = encodeNativeContractPut({
      wasm: input.wasm,
      parameters: input.parameters,
      state: input.state,
    });
    const derived = bs58.encode(frame.instanceId);
    if (derived !== input.instanceIdBase58) {
      throw new FreenetNativeSlotError(
        `slot put: node would publish ${derived} but this device derived ${input.instanceIdBase58} — ` +
          'the pinned slot code hash and the shipped WASM disagree (npm run desktop:verify:pack)',
      );
    }

    try {
      const putReply = await this.request(frame.bytes);
      const putDecoded = decodeNativeHostResult(putReply);
      if (putDecoded.ok) {
        if (!bytesEqual(putDecoded.instanceId, frame.instanceId)) {
          throw new FreenetNativeSlotError(
            `slot put: node published ${bs58.encode(putDecoded.instanceId)} but this device derived ${input.instanceIdBase58}`,
          );
        }
        return {
          uri: encodeFreenet02Uri(input.instanceIdBase58),
          instanceIdBase58: input.instanceIdBase58,
          mode: 'put',
        };
      }
      const putMessage = nativeHostPutErrorMessage(putDecoded);
      if (!looksLikeAlreadyPublished(putMessage)) {
        throw new FreenetNativeSlotError(
          `Freenet native slot PUT failed (${this.wsUrl}): ${putMessage}`,
        );
      }

      return this.updateJoinSlot({
        instanceIdBase58: input.instanceIdBase58,
        state: input.state,
        codeHash: frame.codeHash,
      });
    } catch (error) {
      if (error instanceof FreenetNativeSlotError) throw error;
      const hung = error instanceof FreenetNativeWsError && error.hung;
      const message = error instanceof Error ? error.message : String(error);
      throw new FreenetNativeSlotError(
        `Freenet native slot publish failed (${this.wsUrl}): ${message}`,
        hung,
      );
    }
  }

  private request(frame: Uint8Array): Promise<Uint8Array> {
    return sendNativeRequest({
      wsUrl: this.wsUrl,
      authToken: this.authToken || undefined,
      connectTimeoutMs: this.connectTimeoutMs,
      requestTimeoutMs: this.requestTimeoutMs,
      frame,
      webSocket: this.webSocket,
    });
  }
}
