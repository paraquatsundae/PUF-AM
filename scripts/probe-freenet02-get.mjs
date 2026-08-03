import { Freenet02WsTransport } from '../units/mist-freenet/src/freenet02-ws-transport.ts';

const KEY = '4k8PiYTL5mttmp2Jct2ZmP3GuuG6Eybexxs2f4Js2ggm';
const transport = new Freenet02WsTransport();
await transport.connect();
const uri = `FN02@${KEY}`;
const data = await transport.getBlob(uri);
console.log('GET', data?.byteLength, data ? new TextDecoder().decode(data) : null);
await transport.disconnect();
