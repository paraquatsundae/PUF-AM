/**
 * The device PIN has to reach the ticket *lookup*, not just the fetch.
 *
 * A Freenet slot's address is derived from the FarmSeed the PIN unlocks, so a join
 * that forwards the PIN only to the rehydrate step leaves
 * `FreenetSlotJoinTicketResolver` unable to answer on any PIN-locked device — which
 * is the normal state after FarmCode recovery. That made the Freenet route
 * unreachable from the one screen built to use it.
 *
 * @see Plans/APK_FREENET_PLUGIN.md §7a
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('./mistDisasterRecovery.ts', () => ({
  fetchAndRehydrateFarmFromAddresses: vi.fn(async () => ({
    hot: { after: { diary: 3 } },
    geometry: { after: { blocks: 2 } },
  })),
  refreshFarmUiAfterRecovery: vi.fn(async () => {}),
}));

vi.mock('./mistDeviceSession.ts', () => ({
  markMistJoinTicketAccepted: vi.fn(),
}));

import { joinFarmWithShortTicket } from './mistJoinWithTicket.ts';
import { fetchAndRehydrateFarmFromAddresses } from './mistDisasterRecovery.ts';
import type { JoinTicketResolver, ResolveJoinTicketOptions } from './joinTicketResolver.ts';

const MANIFEST = {
  v: 2 as const,
  farmId: 'farm-1',
  hotUri: 'FN02@hot',
  bonesUri: 'FN02@bones',
  role: 'farmer' as const,
  ticket: 'PUF-K7M2-9Q4X',
};

function spyResolver(): { resolver: JoinTicketResolver; seen: ResolveJoinTicketOptions[] } {
  const seen: ResolveJoinTicketOptions[] = [];
  return {
    seen,
    resolver: {
      id: 'spy',
      label: 'Spy',
      async resolve(_ticket, _farmId, options) {
        seen.push(options ?? {});
        return { manifest: MANIFEST, resolvedBy: 'spy' };
      },
    },
  };
}

describe('joinFarmWithShortTicket', () => {
  it('hands the device PIN to the resolvers', async () => {
    const { resolver, seen } = spyResolver();

    await joinFarmWithShortTicket({
      farmId: 'farm-1',
      ticket: 'PUF-K7M2-9Q4X',
      devicePin: '1234',
      resolvers: [resolver],
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.devicePin).toBe('1234');
  });

  it('still passes it to the rehydrate step', async () => {
    const { resolver } = spyResolver();

    await joinFarmWithShortTicket({
      farmId: 'farm-1',
      ticket: 'PUF-K7M2-9Q4X',
      devicePin: '1234',
      resolvers: [resolver],
    });

    expect(fetchAndRehydrateFarmFromAddresses).toHaveBeenCalledWith('farm-1', MANIFEST, '1234');
  });

  it('sends no PIN when the session is not locked, rather than an empty one', async () => {
    const { resolver, seen } = spyResolver();

    await joinFarmWithShortTicket({
      farmId: 'farm-1',
      ticket: 'PUF-K7M2-9Q4X',
      resolvers: [resolver],
    });

    expect(seen[0]).not.toHaveProperty('devicePin');
  });

  it('forwards the owner address hint alongside it', async () => {
    const { resolver, seen } = spyResolver();

    await joinFarmWithShortTicket({
      farmId: 'farm-1',
      ticket: 'PUF-K7M2-9Q4X',
      ownerBase: '192.168.1.205:3000',
      devicePin: '1234',
      resolvers: [resolver],
    });

    expect(seen[0]?.ownerBase).toBe('192.168.1.205:3000');
    expect(seen[0]?.devicePin).toBe('1234');
  });
});
