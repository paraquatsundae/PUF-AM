import { afterEach, describe, expect, it } from 'vitest';

import {
  nativeRequestHungMessage,
  sendNativeRequest,
  type NativeWebSocketConstructor,
} from './src/freenet02-native-ws.ts';
import { nativeWsRequestInFlight, resetNativeWsQueueForTests } from './src/freenet02-native-ws-queue.ts';

afterEach(() => {
  resetNativeWsQueueForTests();
});

function silentSocket() {
  class SilentSocket {
    static readonly OPEN = 1;
    readyState = 0;
    binaryType = 'blob';
    private listeners = new Map<string, Set<(event: unknown) => void>>();

    constructor(_url: string) {
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

    send(): void {
      /* never answers — the 0.2.x hang */
    }

    close(): void {
      this.readyState = 3;
    }

    private emit(type: string, event: unknown): void {
      for (const fn of this.listeners.get(type) ?? []) fn(event);
    }
  }

  return SilentSocket as unknown as NativeWebSocketConstructor;
}

function delayedReplySocket(reply: Uint8Array, delayMs: number) {
  let sends = 0;
  class DelayedSocket {
    static readonly OPEN = 1;
    readyState = 0;
    binaryType = 'arraybuffer';
    private listeners = new Map<string, Set<(event: unknown) => void>>();

    constructor(_url: string) {
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

    send(): void {
      sends += 1;
      if (sends === 1) {
        setTimeout(() => {
          this.emit('message', { data: reply.buffer.slice(reply.byteOffset, reply.byteOffset + reply.byteLength) });
        }, delayMs);
      }
    }

    close(): void {
      this.readyState = 3;
    }

    private emit(type: string, event: unknown): void {
      for (const fn of this.listeners.get(type) ?? []) fn(event);
    }
  }

  return { ctor: DelayedSocket as unknown as NativeWebSocketConstructor };
}

describe('nativeRequestHungMessage', () => {
  it('is operator-actionable and does not mention the spike', () => {
    const message = nativeRequestHungMessage(45_000);
    expect(message).toContain('45000ms');
    expect(message).toMatch(/On Opennet/);
    expect(message).toMatch(/Stop Freenet/);
    expect(message).not.toMatch(/spike/i);
  });
});

describe('sendNativeRequest', () => {
  it('fails with hung copy when the node never answers', async () => {
    await expect(
      sendNativeRequest({
        frame: new Uint8Array([1, 0, 0, 0]),
        connectTimeoutMs: 40,
        requestTimeoutMs: 30,
        webSocket: silentSocket(),
      }),
    ).rejects.toMatchObject({
      hung: true,
      message: nativeRequestHungMessage(30),
    });
  });

  it('serializes overlapping requests so a second PUT waits', async () => {
    const first = delayedReplySocket(new Uint8Array([7]), 40);
    const order: string[] = [];

    const a = sendNativeRequest({
      frame: new Uint8Array([1]),
      connectTimeoutMs: 40,
      requestTimeoutMs: 200,
      webSocket: first.ctor,
    }).then((bytes) => {
      order.push(`a:${bytes[0]}`);
    });

    expect(nativeWsRequestInFlight()).toBe(true);

    const b = sendNativeRequest({
      frame: new Uint8Array([2]),
      connectTimeoutMs: 40,
      requestTimeoutMs: 200,
      webSocket: delayedReplySocket(new Uint8Array([8]), 0).ctor,
    }).then((bytes) => {
      order.push(`b:${bytes[0]}`);
    });

    await Promise.all([a, b]);
    expect(order).toEqual(['a:7', 'b:8']);
    expect(nativeWsRequestInFlight()).toBe(false);
  });
});
