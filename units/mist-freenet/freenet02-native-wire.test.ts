/**
 * Hermetic: the Node-side publish paths reach the native clients, and the
 * WebSocket they open is the one they were handed.
 *
 * Phase 2 of Plans/FREENET_NETWORK_PACK.md made `BrowserFreenetPutClient` /
 * `BrowserFreenetSlotClient` the only PUT. These tests stand in a fake socket
 * that answers the way a 0.2 node does, so the wiring in
 * `Freenet02WsTransport.putBlob` and `putJoinSlotNative` is proven without a
 * node — the live suites (`FREENET_LIVE_WS=1`, `npm run mist:smoke:native`)
 * prove the node.
 */

import bs58 from 'bs58';
import { describe, expect, it } from 'vitest';

import {
  encodeNativeContractPut,
  encodeNativePackPut,
} from './src/freenet02-native-bincode.ts';
import { sendNativeRequest, type NativeWebSocketConstructor } from './src/freenet02-native-ws.ts';
import { packInstanceIdBase58, unpackContractWasm } from './src/freenet02-pack-id.ts';
import {
  deriveJoinSlotAddress,
  deriveJoinSlotSigningSeed,
  encodeJoinSlotState,
  joinSlotSequence,
} from './src/freenet02-slot.ts';
import { putJoinSlotNative } from './src/freenet02-slot-publish.ts';
import { Freenet02WsTransport } from './src/freenet02-ws-transport.ts';

const TINY_WASM = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x74, 0x69, 0x6e, 0x79]);

/** bincode `Result::Ok(HostResponse::ContractResponse(PutResponse { key }))`. */
function okPutReply(instanceId: Uint8Array, codeHash: Uint8Array, variant: 1 | 3 = 1): Uint8Array {
  const out = new Uint8Array(12 + 64);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0, true); // Ok
  view.setUint32(4, 0, true); // HostResponse::ContractResponse
  view.setUint32(8, variant, true); // PutResponse | UpdateResponse
  out.set(instanceId, 12);
  out.set(codeHash, 44);
  return out;
}

/** bincode `Result::Err(ErrorKind::Unhandled { cause })`. */
function errReply(cause: string): Uint8Array {
  const text = new TextEncoder().encode(cause);
  const out = new Uint8Array(16 + text.byteLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, 1, true); // Err
  view.setUint32(4, 6, true); // Unhandled
  view.setBigUint64(8, BigInt(text.byteLength), true);
  out.set(text, 16);
  return out;
}

type Answer = (frame: Uint8Array) => Uint8Array;

/**
 * Enough of a WHATWG WebSocket for `sendNativeRequest`: opens on the next tick,
 * answers every non-control frame through `answer`, records what it saw.
 */
function fakeWebSocket(answer: Answer) {
  const opened: string[] = [];
  const frames: Uint8Array[] = [];

  class FakeSocket {
    static readonly OPEN = 1;
    readyState = 0;
    binaryType = 'blob';
    private listeners = new Map<string, Set<(event: unknown) => void>>();

    constructor(url: string) {
      opened.push(url);
      setTimeout(() => {
        this.readyState = 1;
        this.emit('open', {});
      }, 0);
    }

    addEventListener(type: string, fn: (event: unknown) => void): void {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type)!.add(fn);
    }

    removeEventListener(type: string, fn: (event: unknown) => void): void {
      this.listeners.get(type)?.delete(fn);
    }

    send(data: Uint8Array): void {
      const tag = new DataView(data.buffer, data.byteOffset, 4).getUint32(0, true);
      if (tag === 3 || tag === 5) return; // Authenticate / Close
      frames.push(data);
      const reply = answer(data);
      setTimeout(() => this.emit('message', { data: reply.buffer.slice(reply.byteOffset, reply.byteOffset + reply.byteLength) }), 0);
    }

    close(): void {
      this.readyState = 3;
    }

    private emit(type: string, event: unknown): void {
      for (const fn of this.listeners.get(type) ?? []) fn(event);
    }
  }

  return { ctor: FakeSocket as unknown as NativeWebSocketConstructor, opened, frames };
}

describe('Freenet02WsTransport.putBlob — native PUT, no CLI', () => {
  it('publishes through the injected socket and returns the pack address', async () => {
    const data = new TextEncoder().encode('pufam-native-wire-test');
    const expected = encodeNativePackPut({ data, wasm: TINY_WASM });
    const socket = fakeWebSocket(() => okPutReply(expected.instanceId, expected.codeHash));

    const transport = new Freenet02WsTransport({
      wsUrl: 'ws://127.0.0.1:7609/v1/contract/command',
      webSocket: socket.ctor,
      packWasm: TINY_WASM,
    });

    const result = await transport.putBlob(data, { identifier: 'wire-test' });

    expect(result.identifier).toBe('wire-test');
    // The address is derived from the WASM actually sent (TINY_WASM here), so it
    // differs from the pinned-contract id — that is what proves the transport
    // used the injected WASM rather than a hard-coded hash.
    expect(result.uri).toBe(`FN02@${bs58.encode(expected.instanceId)}`);
    expect(result.uri).not.toBe(`FN02@${packInstanceIdBase58(data)}`);
    expect(socket.frames).toHaveLength(1);
    expect(Buffer.from(socket.frames[0]!)).toEqual(Buffer.from(expected.bytes));
    // The native socket, on the node the transport was pointed at.
    expect(socket.opened).toEqual(['ws://127.0.0.1:7609/v1/contract/command?encodingProtocol=native']);
    // The flatbuffers GET socket was never opened for a put.
    expect(transport.isConnected()).toBe(false);
  });

  it('surfaces the node refusal and records it in health', async () => {
    const socket = fakeWebSocket(() => errReply('contract too large'));
    const transport = new Freenet02WsTransport({ webSocket: socket.ctor, packWasm: TINY_WASM });

    await expect(transport.putBlob(new Uint8Array([1, 2, 3]))).rejects.toThrow(/contract too large/);
    expect((await transport.health()).lastError).toMatch(/contract too large/);
  });
});

describe('putJoinSlotNative — PUT, then UPDATE with the real code hash', () => {
  async function slot() {
    const farmSeed = new Uint8Array(32).fill(9);
    const ticket = 'PUF-TEST-SLOT';
    const address = await deriveJoinSlotAddress(farmSeed, ticket);
    const state = encodeJoinSlotState({
      slotId: address.slotId,
      signingSeed: await deriveJoinSlotSigningSeed(farmSeed),
      seq: joinSlotSequence(),
      payload: new Uint8Array([1, 2, 3, 4]),
    });
    // The pinned slot WASM on disk — the address above was derived from its code hash.
    const { loadSlotContractWasm } = await import('./src/freenet02-slot-publish.ts');
    const wasm = await loadSlotContractWasm();
    return { address, state, wasm };
  }

  it('reports mode put when the node accepts the first publish', async () => {
    const { address, state, wasm } = await slot();
    const frame = encodeNativeContractPut({ wasm, parameters: address.parameters, state });
    const socket = fakeWebSocket(() => okPutReply(frame.instanceId, frame.codeHash));

    const result = await putJoinSlotNative(
      { parameters: address.parameters, state, instanceIdBase58: address.instanceIdBase58 },
      { wsUrl: 'ws://127.0.0.1:7609/v1/contract/command', webSocket: socket.ctor },
    );

    expect(result).toEqual({ uri: address.uri, instanceIdBase58: address.instanceIdBase58, mode: 'put' });
    expect(socket.frames).toHaveLength(1);
  });

  it('falls back to UpdateData::State carrying the WASM code hash, never zeros', async () => {
    const { address, state, wasm } = await slot();
    const { codeHash } = unpackContractWasm(wasm);
    const socket = fakeWebSocket((frame) => {
      const request = new DataView(frame.buffer, frame.byteOffset, 8).getUint32(4, true);
      if (request === 0) return errReply('contract already exists');
      return okPutReply(address.instanceId, codeHash, 3);
    });

    const result = await putJoinSlotNative(
      { parameters: address.parameters, state, instanceIdBase58: address.instanceIdBase58 },
      { webSocket: socket.ctor },
    );

    expect(result.mode).toBe('update');
    expect(result.instanceIdBase58).toBe(address.instanceIdBase58);
    expect(socket.frames).toHaveLength(2);
    // Update frame: [u32 ContractOp][u32 Update][32 instance id][32 code hash]…
    const update = socket.frames[1]!;
    expect(Buffer.from(update.subarray(8, 40))).toEqual(Buffer.from(address.instanceId));
    expect(Buffer.from(update.subarray(40, 72))).toEqual(Buffer.from(codeHash));
    expect(update.subarray(40, 72).some((b) => b !== 0)).toBe(true);
  });

  it('refuses bytes that are not a PUFSLOT1 state before opening a socket', async () => {
    const { address } = await slot();
    const socket = fakeWebSocket(() => errReply('never asked'));

    await expect(
      putJoinSlotNative(
        // Long enough to pass the length check, wrong magic — the refusal must be about PUFSLOT1.
        { parameters: address.parameters, state: new Uint8Array(96), instanceIdBase58: address.instanceIdBase58 },
        { webSocket: socket.ctor },
      ),
    ).rejects.toThrow(/PUFSLOT1/);
    expect(socket.opened).toHaveLength(0);
  });
});

describe('sendNativeRequest — socket injection', () => {
  it('names the fix when the runtime has no WebSocket and none was injected', async () => {
    const original = (globalThis as { WebSocket?: unknown }).WebSocket;
    (globalThis as { WebSocket?: unknown }).WebSocket = undefined;
    try {
      await expect(
        sendNativeRequest({ frame: new Uint8Array([0, 0, 0, 0]), connectTimeoutMs: 50 }),
      ).rejects.toThrow(/pass `webSocket`/);
    } finally {
      (globalThis as { WebSocket?: unknown }).WebSocket = original;
    }
  });
});
