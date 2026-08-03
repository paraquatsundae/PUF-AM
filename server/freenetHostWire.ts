/**
 * Adapter marrying the Freenet host plugin to the mist transport.
 *
 * This is the *only* glue between the two units: `units/puf-freenet-host` owns
 * node lifecycle and knows nothing about mist crypto or pack-contracts;
 * `units/mist-freenet` owns sealing and addressing and knows nothing about
 * process supervision. Keeping the glue here is what makes the PUF-FN fork cheap.
 *
 * See `Plans/DESKTOP_FREENET_PLUGIN.md` §5.1.
 */

import {
  Freenet02WsTransport,
  type Freenet02WsTransportOptions,
} from '../units/mist-freenet/src/node.ts';
import type { FreenetWireClient } from '../units/puf-freenet-host/src/index.ts';

/**
 * Ciphertext-only wire over the Freenet 0.2 WebSocket API.
 * Callers must have already AEAD-sealed the bytes — `FreenetMistStore` enforces this.
 */
export function createMistFreenetWire(
  options: Freenet02WsTransportOptions = {},
): FreenetWireClient {
  const transport = new Freenet02WsTransport(options);

  return {
    async putCiphertext(bytes, putOptions) {
      const result = await transport.putBlob(bytes, putOptions);
      return { uri: result.uri, identifier: result.identifier };
    },
    getCiphertext(uri) {
      return transport.getBlob(uri);
    },
  };
}
