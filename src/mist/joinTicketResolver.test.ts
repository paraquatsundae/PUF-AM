import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FreenetSlotJoinTicketResolver,
  JoinTicketMismatchError,
  JoinTicketUnavailableError,
  LAN_JOIN_UNAVAILABLE_MESSAGE,
  LanJoinTicketResolver,
  NO_JOIN_ROUTE_MESSAGE,
  defaultJoinTicketResolvers,
  registerJoinTicketOnLan,
  resolveJoinTicket,
  type JoinManifestV2,
  type JoinTicketResolver,
} from './joinTicketResolver.ts';

const FARM_ID = 'farm-abc';
const TICKET = 'PUF-K7M2-9Q4X';

function manifest(overrides: Partial<JoinManifestV2> = {}): JoinManifestV2 {
  return {
    v: 2,
    farmId: FARM_ID,
    hotUri: 'FN02@hot',
    bonesUri: 'FN02@bones',
    role: 'farmer',
    ticket: TICKET,
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

/** Stands in for the hub Express — records the URL the resolver asked for. */
function stubHub(handler: (url: string) => Response) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input);
    calls.push(url);
    return handler(url);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

describe('LanJoinTicketResolver', () => {
  beforeEach(() => {
    vi.stubGlobal('window', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves a ticket through this device own hub', async () => {
    const { calls } = stubHub(() =>
      jsonResponse(200, { manifest: manifest(), resolvedFrom: '192.168.1.20:3000' }),
    );

    const result = await new LanJoinTicketResolver().resolve(TICKET, FARM_ID);

    expect(result.manifest.hotUri).toBe('FN02@hot');
    expect(result.manifest.role).toBe('farmer');
    expect(result.resolvedBy).toBe('lan (192.168.1.20:3000)');
    expect(calls[0]).toContain('/api/sync/join-ticket/PUF-K7M2-9Q4X/resolve');
    expect(calls[0]).toContain(`farmId=${FARM_ID}`);
  });

  it('canonicalizes a sloppily typed ticket before asking the hub', async () => {
    const { calls } = stubHub(() => jsonResponse(200, { manifest: manifest() }));

    await new LanJoinTicketResolver().resolve('  puf k7m2 9q4x ', FARM_ID);

    expect(calls[0]).toContain('/api/sync/join-ticket/PUF-K7M2-9Q4X/resolve');
  });

  it('passes the owner address hint through when the joiner supplies one', async () => {
    const { calls } = stubHub(() => jsonResponse(200, { manifest: manifest() }));

    await new LanJoinTicketResolver().resolve(TICKET, FARM_ID, { ownerBase: '192.168.1.20:3000' });

    expect(calls[0]).toContain('base=192.168.1.20');
  });

  it('rejects a malformed ticket without touching the network', async () => {
    const { fetchMock } = stubHub(() => jsonResponse(200, {}));

    await expect(new LanJoinTicketResolver().resolve('nope', FARM_ID)).rejects.toThrow(
      JoinTicketMismatchError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says the hub has no such ticket when it answers with nothing', async () => {
    stubHub(() => jsonResponse(404, { error: undefined }));

    await expect(new LanJoinTicketResolver().resolve(TICKET, FARM_ID)).rejects.toThrow(
      LAN_JOIN_UNAVAILABLE_MESSAGE,
    );
  });

  it('no longer promises Freenet tickets "later" — that route shipped', () => {
    expect(LAN_JOIN_UNAVAILABLE_MESSAGE).not.toMatch(/coming later/i);
  });

  it('reports the same-Wi-Fi message when the hub itself is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    await expect(new LanJoinTicketResolver().resolve(TICKET, FARM_ID)).rejects.toThrow(
      JoinTicketUnavailableError,
    );
  });

  it('refuses a manifest for a different farm than the recovered FarmCode', async () => {
    stubHub(() => jsonResponse(200, { manifest: manifest({ farmId: 'someone-elses-farm' }) }));

    await expect(new LanJoinTicketResolver().resolve(TICKET, FARM_ID)).rejects.toThrow(
      JoinTicketMismatchError,
    );
  });

  it('surfaces the hub farm-mismatch verdict as a mismatch, not a retry', async () => {
    stubHub(() => jsonResponse(409, { error: 'Different farm' }));

    await expect(new LanJoinTicketResolver().resolve(TICKET, FARM_ID)).rejects.toThrow(
      JoinTicketMismatchError,
    );
  });

  it('rejects a manifest the hub returned in a shape we cannot trust', async () => {
    stubHub(() => jsonResponse(200, { manifest: { v: 1, hotUri: 'FN02@hot' } }));

    await expect(new LanJoinTicketResolver().resolve(TICKET, FARM_ID)).rejects.toThrow(
      JoinTicketUnavailableError,
    );
  });
});

describe('resolveJoinTicket seam', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const failing: JoinTicketResolver = {
    id: 'stub-unavailable',
    label: 'Stub',
    resolve: async () => {
      throw new JoinTicketUnavailableError('stub has nothing');
    },
  };

  const answering: JoinTicketResolver = {
    id: 'stub-ok',
    label: 'Stub',
    resolve: async () => ({ manifest: manifest({ role: 'admin' }), resolvedBy: 'stub' }),
  };

  it('walks past a resolver that cannot answer and uses the next one', async () => {
    const result = await resolveJoinTicket(TICKET, FARM_ID, {
      resolvers: [failing, answering],
    });

    expect(result.resolvedBy).toBe('stub');
    expect(result.manifest.role).toBe('admin');
  });

  it('stops on a mismatch — a wrong farm is not fixed by asking elsewhere', async () => {
    const mismatching: JoinTicketResolver = {
      id: 'stub-mismatch',
      label: 'Stub',
      resolve: async () => {
        throw new JoinTicketMismatchError('wrong farm');
      },
    };
    const second = vi.fn();

    await expect(
      resolveJoinTicket(TICKET, FARM_ID, {
        resolvers: [mismatching, { id: 'x', label: 'x', resolve: second }],
      }),
    ).rejects.toThrow(JoinTicketMismatchError);
    expect(second).not.toHaveBeenCalled();
  });

  it('reports the one failure verbatim when there was only one route', async () => {
    await expect(
      resolveJoinTicket(TICKET, FARM_ID, { resolvers: [failing] }),
    ).rejects.toThrow('stub has nothing');
  });

  it('names every route when they all decline', async () => {
    // With two routes, the last failure alone reads as the whole story and sends an
    // operator to the wrong place.
    const lanish: JoinTicketResolver = {
      id: 'lan-ish',
      label: 'Same Wi‑Fi as the farm owner',
      resolve: async () => {
        throw new JoinTicketUnavailableError('hub had no such ticket');
      },
    };
    const freenetish: JoinTicketResolver = {
      id: 'freenet-ish',
      label: 'Freenet, from anywhere',
      resolve: async () => {
        throw new JoinTicketUnavailableError('no node on this device');
      },
    };

    const error = await resolveJoinTicket(TICKET, FARM_ID, {
      resolvers: [lanish, freenetish],
    }).then(
      () => {
        throw new Error('resolveJoinTicket should not resolve when every route declines');
      },
      (err: unknown) => err as Error,
    );

    expect(error.message).toContain(NO_JOIN_ROUTE_MESSAGE);
    expect(error.message).toContain('hub had no such ticket');
    expect(error.message).toContain('no node on this device');
  });

  it('passes the device PIN through, which only the Freenet resolver needs', async () => {
    const resolve = vi.fn<JoinTicketResolver['resolve']>(async () => ({
      manifest: manifest(),
      resolvedBy: 'stub',
    }));

    await resolveJoinTicket(TICKET, FARM_ID, {
      devicePin: '1234',
      resolvers: [{ id: 'x', label: 'x', resolve }],
    });

    expect(resolve.mock.calls[0]?.[2]).toMatchObject({ devicePin: '1234' });
  });
});

describe('defaultJoinTicketResolvers', () => {
  it('tries the LAN hub first and Freenet second', () => {
    // Order is the design, not a detail: a hub on the same Wi‑Fi answers in
    // milliseconds and needs no internet, while Opennet is a round trip through
    // strangers. Freenet is the fallback that removes the same-Wi‑Fi requirement.
    expect(defaultJoinTicketResolvers().map((resolver) => resolver.id)).toEqual([
      'lan',
      'freenet-slot',
    ]);
  });

  it('exposes both routes as real resolvers, not a comment', () => {
    const [lan, freenet] = defaultJoinTicketResolvers();
    expect(lan).toBeInstanceOf(LanJoinTicketResolver);
    expect(freenet).toBeInstanceOf(FreenetSlotJoinTicketResolver);
  });
});

describe('registerJoinTicketOnLan', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts a v2 manifest with the canonical ticket', async () => {
    let body: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init: RequestInit) => {
        body = JSON.parse(String(init.body)) as Record<string, unknown>;
        return jsonResponse(200, { ok: true, ticket: TICKET });
      }),
    );

    await registerJoinTicketOnLan({
      ticket: 'puf-k7m2-9q4x',
      farmId: FARM_ID,
      hotUri: 'FN02@hot',
      bonesUri: 'FN02@bones',
      role: 'farmer',
    });

    expect(body.v).toBe(2);
    expect(body.ticket).toBe(TICKET);
    expect(body.role).toBe('farmer');
  });

  it('surfaces the hub error when registration is refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(403, { error: 'LAN only' })));

    await expect(
      registerJoinTicketOnLan({
        ticket: TICKET,
        farmId: FARM_ID,
        hotUri: 'FN02@hot',
        bonesUri: 'FN02@bones',
        role: 'farmer',
      }),
    ).rejects.toThrow('LAN only');
  });

  it('will not register a malformed ticket', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      registerJoinTicketOnLan({
        ticket: 'bad',
        farmId: FARM_ID,
        hotUri: 'FN02@hot',
        bonesUri: 'FN02@bones',
        role: 'farmer',
      }),
    ).rejects.toThrow('malformed join ticket');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
