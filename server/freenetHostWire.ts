/**
 * Adapter marrying the Freenet host plugin to the mist transport.
 *
 * This is the *only* glue between the two units: `units/puf-freenet-host` owns
 * node lifecycle and knows nothing about mist crypto or pack-contracts;
 * `units/mist-freenet` owns sealing and addressing and knows nothing about
 * process supervision. Keeping the glue here is what makes the PUF-FN fork cheap.
 *
 * Since Phase 1 slice B (Plans/FREENET_NETWORK_PACK.md decision 2) this wire is
 * the renderer's data path on Electron: `desktop/main.ts` answers the
 * `puf-freenet:put|get|slot-put|slot-get` IPC by calling the host, and the host
 * calls this. The Express `FreenetPeer` (`freenetPeerHost.ts`) is a separate
 * client of the same node, kept for the LAN relay.
 *
 * See `Plans/reference/DESKTOP_FREENET_PLUGIN.md` §5.1.
 */

import { assertCiphertextForFreenet } from '../units/mist-freenet/src/ciphertext-guard.ts';
import type { FreenetTransport } from '../units/mist-freenet/src/freenet-transport.ts';
import {
  Freenet02WsTransport,
  type Freenet02WsTransportOptions,
} from '../units/mist-freenet/src/node.ts';
import type { FreenetWireClient } from '../units/puf-freenet-host/src/index.ts';
import {
  nativeJoinSlotPut,
  publishJoinSlot,
  readJoinSlotState,
  type JoinSlotPutFn,
} from './freenetSlotOps.ts';

export type MistFreenetWireOptions = Freenet02WsTransportOptions & {
  /** Tests: stand in for the WebSocket transport. */
  transport?: FreenetTransport;
  /** Tests: stand in for the native slot publish. */
  slotPut?: JoinSlotPutFn;
};

/**
 * Ciphertext-only wire over the Freenet 0.2 WebSocket API.
 *
 * Callers must have already AEAD-sealed the bytes. `FreenetMistStore.put`
 * enforces that on the relay path; this enforces it on the host path, so there
 * is no route to the node that skips `assertCiphertextForFreenet`
 * (Plans/FREENET_OPERATOR_FLOW.md §9.3). The `identifier` doubles as the mist
 * storage key when the caller has one, which only sharpens the refusal message —
 * a blob with no key is still held to the AEAD envelope shape.
 *
 * Both puts are the app's own native clients (Phase 2, decision 1): blobs via
 * `Freenet02WsTransport.putBlob` → `BrowserFreenetPutClient`, slots via
 * `putJoinSlotNative` → `BrowserFreenetSlotClient`, pointed at the same node
 * the host supervises (`wsUrl`). The page signs; the host moves bytes.
 */
export function createMistFreenetWire(options: MistFreenetWireOptions = {}): FreenetWireClient {
  const { transport: injected, slotPut: injectedSlotPut, ...transportOptions } = options;
  const transport = injected ?? new Freenet02WsTransport(transportOptions);
  const slotPut =
    injectedSlotPut ??
    nativeJoinSlotPut({
      wsUrl: transportOptions.wsUrl,
      authToken: transportOptions.authToken,
      connectTimeoutMs: transportOptions.connectTimeoutMs,
      requestTimeoutMs: transportOptions.requestTimeoutMs,
      webSocket: transportOptions.webSocket,
    });

  return {
    async putCiphertext(bytes, putOptions) {
      assertCiphertextForFreenet(putOptions?.identifier ?? 'puf-freenet-host', bytes);
      const result = await transport.putBlob(bytes, putOptions);
      return { uri: result.uri, identifier: result.identifier };
    },
    getCiphertext(uri) {
      return transport.getBlob(uri);
    },
    putSlotState(input) {
      return publishJoinSlot(input, slotPut);
    },
    getSlotState(instanceIdBase58) {
      return readJoinSlotState(transport, instanceIdBase58);
    },
  };
}
