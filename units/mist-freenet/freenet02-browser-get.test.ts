/**
 * The two shapes of a miss, and the retry between them.
 *
 * `freenet02-browser-get-live.test.ts` covers the half a real node can show
 * cheaply — an address nothing was published to answers `ContractNotFound`, and
 * that is a `null`. The other half needs a node that never answers at all, which
 * is the ordinary state of a slot in the minutes after the owner published it
 * and is not something a bench node can be asked to reproduce on demand. So the
 * SDK is faked here and the wait is measured in mocked rejections rather than
 * minutes.
 *
 * What matters downstream: `null` means "ask the hub next", a thrown
 * `searchedInVain` means "this node looked and came back empty-handed", and
 * anything else means the node itself is unusable. `readJoinSlotState()` in
 * `src/mist/joinSlotFreenet.ts` turns each into a different sentence.
 *
 * @see Plans/APK_FREENET_PLUGIN.md §3b
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Queued answers for successive `api.get()` calls. */
const answers = vi.hoisted(() => ({
  queue: [] as (Error | { state: Uint8Array | null })[],
  gets: 0,
  disconnects: 0,
  opened: 0,
}));

vi.mock('@freenetorg/freenet-stdlib', () => {
  class ContractKey {
    private constructor(readonly instanceId: string) {}
    static fromInstanceId(instanceId: string): ContractKey {
      return new ContractKey(instanceId);
    }
  }

  class GetRequest {
    constructor(readonly key: unknown) {}
  }

  class DisconnectRequest {
    constructor(readonly cause: string) {}
  }

  class FreenetWsApi {
    constructor(_url: URL, handler: { onOpen?: () => void }) {
      answers.opened += 1;
      // The real SDK opens a socket and calls back; nothing here is waiting on IO.
      setTimeout(() => handler.onOpen?.(), 0);
    }

    async get(_request: unknown): Promise<{ state: Uint8Array | null }> {
      answers.gets += 1;
      const next = answers.queue.shift();
      if (!next) throw new Error('test queued no answer for this get');
      if (next instanceof Error) throw next;
      return next;
    }

    async disconnect(_request: unknown): Promise<void> {
      answers.disconnects += 1;
    }
  }

  return { ContractKey, DisconnectRequest, FreenetWsApi, GetRequest };
});

const { BrowserFreenetGetClient, FreenetLocalNodeError } = await import(
  './src/freenet02-browser-get.ts'
);

const URI = 'FN02@GR5hs75vNK8A1peMoJAyVSRJ4Tspn2pgnYQeco8ptUdp';

/** One SDK request gives up after 30s, so a budget at or under that gets one pass. */
const ONE_PASS_BUDGET_MS = 30_000;
/** Enough headroom for a second pass after the first 30s timeout. */
const TWO_PASS_BUDGET_MS = 90_000;

beforeEach(() => {
  answers.queue = [];
  answers.gets = 0;
  answers.disconnects = 0;
  answers.opened = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BrowserFreenetGetClient misses', () => {
  it('reports a node that answered "not found" as an ordinary empty result', async () => {
    answers.queue = [new Error('Contract not found')];
    const client = new BrowserFreenetGetClient({});

    await expect(client.getBlob(URI, { deadlineMs: ONE_PASS_BUDGET_MS })).resolves.toBeNull();
  });

  it('reports an empty state the same way, rather than as zero bytes', async () => {
    answers.queue = [{ state: new Uint8Array(0) }];
    const client = new BrowserFreenetGetClient({});

    await expect(client.getBlob(URI, { deadlineMs: ONE_PASS_BUDGET_MS })).resolves.toBeNull();
  });

  /**
   * The sentence an operator reads is built from this one. It has to say the node
   * searched — "did not answer" would send someone to restart a node that is
   * working perfectly well and simply has not found the blob yet.
   */
  it('says it searched, not that the node is broken, when the budget runs out', async () => {
    answers.queue = [new Error('request timeout')];
    const client = new BrowserFreenetGetClient({});

    const error = await client
      .getBlob(URI, { deadlineMs: ONE_PASS_BUDGET_MS })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FreenetLocalNodeError);
    expect((error as InstanceType<typeof FreenetLocalNodeError>).searchedInVain).toBe(true);
    expect((error as Error).message).toMatch(/searched for 30s and did not find it/);
  });

  /**
   * A timed-out request is dropped by the SDK but the node may still answer it,
   * and that answer would be handed to whichever GET is waiting next. Tearing the
   * socket down first is what stops "where is Hot" being answered with a slot.
   */
  it('starts a fresh socket before retrying a timed-out search', async () => {
    answers.queue = [new Error('request timeout'), { state: new Uint8Array([7, 7]) }];
    const client = new BrowserFreenetGetClient({});

    const bytes = await client.getBlob(URI, { deadlineMs: TWO_PASS_BUDGET_MS });

    expect(bytes).toEqual(new Uint8Array([7, 7]));
    expect(answers.gets).toBe(2);
    expect(answers.disconnects).toBe(1);
    expect(answers.opened).toBe(2);
  });

  it('treats anything else as a node it cannot use', async () => {
    answers.queue = [new Error('connection reset')];
    const client = new BrowserFreenetGetClient({});

    const error = await client
      .getBlob(URI, { deadlineMs: ONE_PASS_BUDGET_MS })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expect((error as InstanceType<typeof FreenetLocalNodeError>).searchedInVain).toBe(false);
    expect((error as Error).message).toMatch(/did not answer/);
  });

  it('refuses a non-FN02 address without opening a socket at all', async () => {
    const client = new BrowserFreenetGetClient({});

    await expect(client.getBlob('CHK@nope')).rejects.toThrow(/FN02/);
    expect(answers.opened).toBe(0);
  });
});
