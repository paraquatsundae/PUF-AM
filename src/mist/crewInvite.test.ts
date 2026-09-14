/**
 * Crew invite resolve refuses a short ticket and never asks for FarmSeed.
 * @see Plans/FREENET_NETWORK_PACK.md Decision — 2026-09-12
 */

import { describe, expect, it, vi } from 'vitest';

import { mintJoinTicket } from '../../shared/sync/joinTicket.ts';
import { mintInviteToken } from '../../units/mist-freenet/src/invite-token.ts';
import { CrewJoinError } from '../../units/mist-freenet/src/crew-join.ts';
import { resolveCrewInvite } from './crewInvite.ts';
import { JoinTicketMismatchError } from './joinTicketResolver.ts';

describe('resolveCrewInvite', () => {
  it('refuses a short 8-symbol ticket without touching the network', async () => {
    await expect(resolveCrewInvite(mintJoinTicket())).rejects.toBeInstanceOf(CrewJoinError);
    await expect(resolveCrewInvite('PUF-K7M2-9Q4X')).rejects.toThrow(/short ticket cannot open/);
  });

  it('walks past a LAN miss instead of stopping on hub pairing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(resolveCrewInvite(mintInviteToken())).rejects.not.toBeInstanceOf(
      JoinTicketMismatchError,
    );
    vi.unstubAllGlobals();
  });
});
