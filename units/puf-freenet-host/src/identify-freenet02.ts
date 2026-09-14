/**
 * Is the listener on this loopback port Freenet 0.2?
 *
 * TCP alone is not enough — a leftover dashboard or any other occupant of
 * :7509 would look "up". Attach only when `GET /v1/version` is `{ version }`
 * for 0.2, or the WS API answers a hello on `/v1/contract/command`.
 * Plans/FREENET_NETWORK_PACK.md Decision — 2026-09-14 (attach only if Freenet 0.2).
 */

import { randomBytes } from 'node:crypto';
import http from 'node:http';
import net from 'node:net';

import { looksLikeFreenet02VersionText, looksLikeHtmlStatusBody } from './node-status-json.ts';

const VERSION_PATH = '/v1/version';
const WS_PATH = '/v1/contract/command';

export function freenetPortNotFreenetMessage(host: string, port: number): string {
  return `${host}:${port} is in use by something that is not Freenet 0.2`;
}

function getText(url: string, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const req = http.get(
      url,
      { headers: { accept: 'application/json, text/plain;q=0.1' } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on('end', () => {
          if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
            resolve(null);
            return;
          }
          resolve(Buffer.concat(chunks).toString('utf8'));
        });
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
  });
}

function wsHello(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.once('connect', () => {
      const key = randomBytes(16).toString('base64');
      socket.write(
        `GET ${WS_PATH} HTTP/1.1\r\n` +
          `Host: ${host}:${port}\r\n` +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          `Sec-WebSocket-Key: ${key}\r\n` +
          'Sec-WebSocket-Version: 13\r\n\r\n',
      );
    });

    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;
      const startLine = buffer.slice(0, buffer.indexOf('\r\n'));
      finish(/HTTP\/1\.\d\s+101\b/.test(startLine));
    });

    socket.connect(port, host);
  });
}

/**
 * Default attach probe. Inject a stub in host tests — do not hit a live :7509.
 */
export async function identifyFreenet02Listener(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<boolean> {
  const text = await getText(`http://${host}:${port}${VERSION_PATH}`, timeoutMs);
  if (text && looksLikeHtmlStatusBody(text)) return false;
  if (text && looksLikeFreenet02VersionText(text)) return true;
  if (text) return false;
  return wsHello(host, port, timeoutMs);
}
