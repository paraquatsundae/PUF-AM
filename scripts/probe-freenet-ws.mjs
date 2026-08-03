/**
 * One-off probe: Freenet 0.2 WebSocket handshake (localhost:7509).
 * Run: node scripts/probe-freenet-ws.mjs
 */
import WebSocket from 'ws';

const base = process.env.FREENET_WS_URL ?? 'ws://127.0.0.1:7509/v1/contract/command';
const authToken = process.env.FREENET_WS_AUTH ?? '';

const url = new URL(base);
url.searchParams.set('encodingProtocol', 'flatbuffers');
if (authToken) url.searchParams.set('authToken', authToken);

console.log('Connecting to', url.toString());

const ws = new WebSocket(url.toString());
ws.binaryType = 'arraybuffer';

const timer = setTimeout(() => {
  console.log('timeout — closing');
  ws.close();
  process.exit(1);
}, 8000);

ws.on('open', () => {
  console.log('OPEN ok');
  clearTimeout(timer);
  ws.close();
  process.exit(0);
});

ws.on('message', (data) => {
  console.log('message', typeof data, data instanceof Buffer ? data.length : data.byteLength ?? '?');
});

ws.on('error', (err) => {
  console.error('ERROR', err.message);
  clearTimeout(timer);
  process.exit(2);
});

ws.on('close', (code, reason) => {
  console.log('CLOSE', code, reason.toString());
  clearTimeout(timer);
});
