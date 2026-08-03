/**
 * One-off live PUT probe (longer wall clock than vitest default).
 * Run: node scripts/probe-freenet02-put.mjs
 */
import { Freenet02WsTransport } from '../units/mist-freenet/src/freenet02-ws-transport.ts';

const transport = new Freenet02WsTransport();
await transport.connect();
console.log('connected', await transport.health());

const data = new TextEncoder().encode(`probe-${Date.now()}`);
try {
  const { uri } = await transport.putBlob(data);
  console.log('PUT ok', uri);
  const back = await transport.getBlob(uri);
  console.log('GET ok', back?.byteLength, new TextDecoder().decode(back));
} catch (err) {
  console.error('FAIL', err);
} finally {
  await transport.disconnect();
}
