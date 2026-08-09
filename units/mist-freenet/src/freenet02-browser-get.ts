/**
 * Freenet 0.2 GET from a page, straight at a node on this device's own loopback.
 *
 * `Freenet02WsTransport` is the same conversation with a Node runtime wrapped
 * around it: `process.env` for the endpoint, `fdev` for PUT, a disk-backed index
 * for the URIs. None of that exists in a WebView, and none of it is needed to
 * *read*. GET is the one flatbuffers path that works end to end on 0.2, which is
 * why a tablet beside a sideloaded Freenet Android node can **join** a farm long
 * before it could publish one.
 *
 * Read-only on purpose. Publishing still goes through `fdev` on a laptop, so
 * there is deliberately no `putBlob` here to be reached for by mistake.
 *
 * The node is a separate application talking a network protocol over loopback —
 * PUF-AM links nothing of Freenet's into its own process, which is the shape the
 * AGPL carve-out in `Plans/DESKTOP_FREENET_PLUGIN.md` §8.4 describes.
 *
 * @see Plans/APK_FREENET_PLUGIN.md §3a, §7a
 */

import {
  ContractKey,
  DisconnectRequest,
  FreenetWsApi,
  GetRequest,
  type ResponseHandler,
} from '@freenetorg/freenet-stdlib';

import { DEFAULT_LOCAL_FREENET_WS_URL } from './freenet02-browser-get-url.ts';
import { parseFreenet02Uri } from './freenet02-uri.ts';

export { DEFAULT_LOCAL_FREENET_WS_URL };

/**
 * One SDK request gives up after 30s, so the ceiling callers care about is a
 * deadline across retries rather than a single wait.
 *
 * A miss arrives in one of two ways, and which one depends on the address rather
 * than on the node:
 *
 * - An address **nothing was ever published to** comes back as a prompt
 *   `ContractNotFound` — about 8s, measured on both a desktop 0.2.119 and the
 *   tablet's 0.2.123. That is a `null`, and it is what keeps trying this device's
 *   node before a hub cheap.
 * - An address that **exists somewhere but has not spread here yet** — the
 *   ordinary state of a slot in the minutes after the owner published it — is a
 *   search that keeps going until someone gives up, so it surfaces as this
 *   timeout instead.
 *
 * The second case is why how long to keep searching is the caller's decision: it
 * depends entirely on whether they have anywhere else to ask.
 */
const SDK_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_DEADLINE_MS = 120_000;
const DEFAULT_CONNECT_TIMEOUT_MS = 6_000;

/** The node could not be reached, or searched and came back empty-handed. */
export class FreenetLocalNodeError extends Error {
  /** True when the node was fine and simply could not find the address in time. */
  readonly searchedInVain: boolean;

  constructor(message: string, searchedInVain = false) {
    super(message);
    this.name = 'FreenetLocalNodeError';
    this.searchedInVain = searchedInVain;
  }
}

export type BrowserFreenetGetClientOptions = {
  wsUrl?: string;
  authToken?: string;
  connectTimeoutMs?: number;
  clientName?: string;
};

export type BrowserFreenetGetOptions = {
  /** Total time to keep asking, across reconnect-and-retry. */
  deadlineMs?: number;
  signal?: AbortSignal;
};

function noopHandler(): ResponseHandler {
  return {
    onContractPut: () => {},
    onContractGet: () => {},
    onContractUpdate: () => {},
    onContractUpdateNotification: () => {},
    onContractNotFound: () => {},
    onDelegateResponse: () => {},
    onErr: () => {},
    onOpen: () => {},
  };
}

function isNotFound(message: string): boolean {
  return /not found/i.test(message);
}

function isRequestTimeout(message: string): boolean {
  return /request timeout/i.test(message);
}

/**
 * A GET-only client for one Freenet node, held open across a join.
 *
 * A join reads three things in a row — the slot, then Hot, then bones — and the
 * SDK correlates responses by arrival order on a single queue, so the requests
 * are issued strictly one at a time and a timed-out request tears the socket
 * down before the next one goes out. A late answer to an abandoned request would
 * otherwise be handed to whichever GET was waiting next, which on this path
 * means answering "where is Hot" with the bytes of a join slot.
 */
export class BrowserFreenetGetClient {
  readonly wsUrl: string;

  private readonly authToken: string;
  private readonly connectTimeoutMs: number;
  private readonly clientName: string;

  private api: FreenetWsApi | null = null;
  private connected = false;
  private connecting: Promise<void> | null = null;
  private inFlight: Promise<unknown> = Promise.resolve();

  constructor(options: BrowserFreenetGetClientOptions = {}) {
    this.wsUrl = options.wsUrl ?? DEFAULT_LOCAL_FREENET_WS_URL;
    this.authToken = options.authToken ?? '';
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.clientName = options.clientName ?? 'PUF-AM-mist';
  }

  isConnected(): boolean {
    return this.connected && this.api !== null;
  }

  async connect(): Promise<void> {
    if (this.isConnected()) return;
    if (this.connecting) return this.connecting;

    this.connecting = this.openApi();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  async disconnect(): Promise<void> {
    const api = this.api;
    this.api = null;
    this.connected = false;
    if (!api) return;
    try {
      await api.disconnect(new DisconnectRequest(`${this.clientName} disconnect`));
    } catch {
      /* Already gone is the outcome we wanted. */
    }
  }

  /**
   * Bytes at an `FN02@…` address, or `null` when the network has nothing there.
   *
   * `null` is a normal answer rather than a failure: a slot published a minute
   * ago is routinely not findable yet, and the caller's job is to say so rather
   * than to report the node as broken.
   */
  async getBlob(uri: string, options: BrowserFreenetGetOptions = {}): Promise<Uint8Array | null> {
    const instanceId = parseFreenet02Uri(uri);
    if (!instanceId) {
      throw new FreenetLocalNodeError(`Not an FN02 URI (${uri.slice(0, 32)}…)`);
    }

    // Serialised against every other GET on this client — see the class comment.
    const run = this.inFlight.then(
      () => this.getBlobExclusive(instanceId, options),
      () => this.getBlobExclusive(instanceId, options),
    );
    this.inFlight = run.catch(() => undefined);
    return run;
  }

  private async getBlobExclusive(
    instanceId: string,
    options: BrowserFreenetGetOptions,
  ): Promise<Uint8Array | null> {
    const budgetMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
    const deadline = Date.now() + budgetMs;

    for (;;) {
      if (options.signal?.aborted) throw new FreenetLocalNodeError('Cancelled');

      await this.connect();
      const key = ContractKey.fromInstanceId(instanceId);

      try {
        const response = await this.api!.get(new GetRequest(key, false, false, false));
        if (!response.state?.length) return null;
        return new Uint8Array(response.state);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isNotFound(message)) return null;

        // The SDK drops a timed-out request from its queue but the node may still
        // answer it, and that answer would resolve the next GET instead. Start a
        // fresh socket rather than carry that risk into the retry.
        await this.disconnect();

        if (!isRequestTimeout(message)) {
          throw new FreenetLocalNodeError(
            `The Freenet node on this device did not answer (${this.wsUrl}): ${message}`,
          );
        }
        if (deadline - Date.now() <= SDK_REQUEST_TIMEOUT_MS) {
          throw new FreenetLocalNodeError(
            `the Freenet node on this device searched for ${Math.round(budgetMs / 1000)}s ` +
              'and did not find it',
            true,
          );
        }
      }
    }
  }

  private openApi(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const fail = (reason: string) => {
        this.api = null;
        this.connected = false;
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new FreenetLocalNodeError(reason));
      };

      const timer = setTimeout(() => {
        fail(`No Freenet node answered on ${this.wsUrl} within ${this.connectTimeoutMs}ms`);
      }, this.connectTimeoutMs);

      const handler: ResponseHandler = {
        ...noopHandler(),
        onOpen: () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.connected = true;
          resolve();
        },
        onClose: (code, reason) => {
          fail(`Freenet node closed the connection (${code}${reason ? ` ${reason}` : ''})`);
        },
      };

      try {
        this.api = new FreenetWsApi(new URL(this.wsUrl), handler, this.authToken || undefined);
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
      }
    });
  }
}
