/**
 * One native-encoded request on a short-lived WebSocket.
 *
 * Pack PUT and slot PUT/UPDATE share this so neither pulls the flatbuffers SDK.
 *
 * The socket class is injectable rather than assumed: a WebView, Node ≥ 22 and
 * Electron's main process all provide `globalThis.WebSocket`, which is the
 * default; an older Node runtime passes the `ws` package's class instead of
 * patching a global (Plans/FREENET_NETWORK_PACK.md decision 1).
 */

import { encodeNativeAuthenticate, encodeNativeClose, toNativeFreenetWsUrl } from './freenet02-native-bincode.ts';
import { DEFAULT_LOCAL_FREENET_WS_URL } from './freenet02-browser-get-url.ts';

const DEFAULT_CONNECT_TIMEOUT_MS = 6_000;
export const NATIVE_WS_DEFAULT_TIMEOUT_MS = 45_000;

/** The subset of the WHATWG `WebSocket` constructor the native request needs. */
export type NativeWebSocketConstructor = new (url: string) => WebSocket;

/** The runtime's own `WebSocket`, or `undefined` when it has none. */
export function defaultNativeWebSocket(): NativeWebSocketConstructor | undefined {
  const ctor = (globalThis as { WebSocket?: unknown }).WebSocket;
  return typeof ctor === 'function' ? (ctor as NativeWebSocketConstructor) : undefined;
}

export class FreenetNativeWsError extends Error {
  readonly hung: boolean;

  constructor(message: string, hung = false) {
    super(message);
    this.name = 'FreenetNativeWsError';
    this.hung = hung;
  }
}

export type SendNativeRequestOptions = {
  wsUrl?: string;
  authToken?: string;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
  frame: Uint8Array;
  /** Socket class to open; defaults to the runtime's `globalThis.WebSocket`. */
  webSocket?: NativeWebSocketConstructor;
};

async function messageBytes(data: unknown): Promise<Uint8Array> {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data instanceof Uint8Array) return data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }
  throw new FreenetNativeWsError('Freenet node sent a non-binary WebSocket frame');
}

export async function sendNativeRequest(options: SendNativeRequestOptions): Promise<Uint8Array> {
  const wsUrl = toNativeFreenetWsUrl(options.wsUrl ?? DEFAULT_LOCAL_FREENET_WS_URL);
  const connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const requestTimeoutMs = options.requestTimeoutMs ?? NATIVE_WS_DEFAULT_TIMEOUT_MS;
  const socket = await openSocket(
    wsUrl,
    connectTimeoutMs,
    options.webSocket ?? defaultNativeWebSocket(),
  );

  try {
    if (options.authToken) socket.send(encodeNativeAuthenticate(options.authToken));
    socket.send(options.frame);
    return await readBinary(socket, wsUrl, requestTimeoutMs);
  } finally {
    closeSocket(socket);
  }
}

function openSocket(
  wsUrl: string,
  connectTimeoutMs: number,
  Ctor: NativeWebSocketConstructor | undefined,
): Promise<WebSocket> {
  if (!Ctor) {
    return Promise.reject(
      new FreenetNativeWsError(
        'WebSocket is not available in this runtime — pass `webSocket` (e.g. the `ws` package) to the native client',
      ),
    );
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let socket: WebSocket;
    try {
      socket = new Ctor(wsUrl);
    } catch (error) {
      reject(new FreenetNativeWsError(error instanceof Error ? error.message : String(error)));
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
      reject(new FreenetNativeWsError(reason));
    };

    const timer = setTimeout(() => {
      fail(`No Freenet node answered on ${wsUrl} within ${connectTimeoutMs}ms`);
    }, connectTimeoutMs);

    socket.binaryType = 'arraybuffer';
    socket.addEventListener('open', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(socket);
    });
    socket.addEventListener('error', () => {
      fail(`Freenet node WebSocket error (${wsUrl})`);
    });
    socket.addEventListener('close', (event) => {
      fail(`Freenet node closed the connection (${event.code}${event.reason ? ` ${event.reason}` : ''})`);
    });
  });
}

function readBinary(socket: WebSocket, wsUrl: string, timeoutMs: number): Promise<Uint8Array> {
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
          new FreenetNativeWsError(
            `native request did not settle in ${timeoutMs}ms — this is the 0.2.x hang the spike is measuring`,
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
      finish(() => reject(new FreenetNativeWsError(`Freenet node WebSocket error (${wsUrl})`)));
    };
    const onClose = (event: CloseEvent) => {
      finish(() =>
        reject(
          new FreenetNativeWsError(
            `Freenet node closed before the request answered (${event.code}${event.reason ? ` ${event.reason}` : ''})`,
          ),
        ),
      );
    };

    socket.addEventListener('message', onMessage);
    socket.addEventListener('error', onError);
    socket.addEventListener('close', onClose);
  });
}

/** `WebSocket.OPEN` per the WHATWG constants; read off the instance so an injected class works too. */
const WS_OPEN = 1;

function closeSocket(socket: WebSocket): void {
  try {
    if (socket.readyState === WS_OPEN) {
      socket.send(encodeNativeClose());
    }
    socket.close();
  } catch {
    /* already gone */
  }
}
