/**
 * Crew invite: no FarmSeed on the joiner; short PUF- cannot unwrap the farm.
 * @see Plans/FREENET_NETWORK_PACK.md Decision — 2026-09-12
 */

import { describe, expect, it } from 'vitest';

import { mintJoinTicket } from '../../shared/sync/joinTicket.ts';
import { bytesToHex } from './src/farm-seed.ts';
import { deriveBonesContractKey } from './src/bones-crypto.ts';
import { deriveHotContractKey } from './src/hot-crypto.ts';
import {
  inviteTokenBytes,
  mintInviteToken,
  normalizeInviteToken,
  normalizePufToken,
  shortTicketCannotUnwrapFarmSeed,
} from './src/invite-token.ts';
import {
  assertNoFarmSeedInEnvelope,
  deriveCrewJoinSlotAddress,
  inviteTokenCannotUnwrapFarmSeed,
  parseCrewJoinEnvelope,
  unwrapCrewJoinEnvelope,
  wrapCrewJoinEnvelope,
  type CrewJoinEnvelope,
} from './src/crew-join.ts';

const FARM_SEED = new Uint8Array(32).fill(9);

function sampleEnvelope(ticket: string, extras?: Record<string, unknown>): CrewJoinEnvelope {
  return {
    v: 3,
    kind: 'crew-join',
    farmId: 'aabbccddeeff0011',
    hotUri: 'FN02@hot',
    bonesUri: 'FN02@bones',
    hotKeyHex: 'aa'.repeat(32),
    bonesKeyHex: 'bb'.repeat(32),
    role: 'farmer',
    ticket,
    ...extras,
  };
}

describe('InviteToken format', () => {
  it('mints 26 Crockford symbols after PUF-', () => {
    const token = mintInviteToken();
    expect(token.startsWith('PUF-')).toBe(true);
    expect(token.replace(/[^0-9A-Z]/g, '').slice(3)).toHaveLength(26);
    expect(normalizeInviteToken(token)).toBe(token);
    expect(normalizePufToken(token)?.kind).toBe('invite-token');
  });

  it('round-trips 16 InviteId bytes', () => {
    const token = mintInviteToken(() => new Uint8Array(16).fill(0x5a));
    const again = mintInviteToken(() => new Uint8Array(16).fill(0x5a));
    expect(token).toBe(again);
    expect(inviteTokenBytes(token)).toHaveLength(16);
  });

  it('does not treat an 8-symbol ticket as an InviteToken', () => {
    const short = mintJoinTicket();
    expect(normalizeInviteToken(short)).toBeNull();
    expect(normalizePufToken(short)?.kind).toBe('short-ticket');
  });
});

describe('crew join envelope', () => {
  it('wraps and unwraps Hot/Bones keys without FarmSeed', async () => {
    const token = mintInviteToken();
    const hotKey = await deriveHotContractKey(FARM_SEED);
    const bonesKey = await deriveBonesContractKey(FARM_SEED);
    const envelope = sampleEnvelope(token, {
      hotKeyHex: bytesToHex(hotKey),
      bonesKeyHex: bytesToHex(bonesKey),
    });
    const sealed = await wrapCrewJoinEnvelope(envelope, token);
    expect(new TextDecoder().decode(sealed)).not.toContain('farmSeed');
    expect(new TextDecoder().decode(sealed)).not.toContain(bytesToHex(FARM_SEED));

    const opened = await unwrapCrewJoinEnvelope(sealed, token);
    expect(opened.hotKeyHex).toBe(bytesToHex(hotKey));
    expect(opened.bonesKeyHex).toBe(bytesToHex(bonesKey));
    expect(opened).not.toHaveProperty('farmSeed');
    expect(opened).not.toHaveProperty('farmSeedHex');
  });

  it('locates the slot from the InviteToken alone', async () => {
    const token = mintInviteToken();
    const a = await deriveCrewJoinSlotAddress(token);
    const b = await deriveCrewJoinSlotAddress(token);
    expect(a.uri).toBe(b.uri);
    expect(a.instanceIdBase58).toBe(b.instanceIdBase58);
  });

  it('refuses to put FarmSeed in the envelope', () => {
    const token = mintInviteToken();
    expect(() =>
      assertNoFarmSeedInEnvelope({ ...sampleEnvelope(token), farmSeedHex: '00'.repeat(32) }),
    ).toThrow(/FarmSeed/);
    expect(parseCrewJoinEnvelope({ ...sampleEnvelope(token), farmSeed: 'nope' })).toBeNull();
  });

  it('short ticket cannot unwrap FarmSeed or a crew envelope', async () => {
    const token = mintInviteToken();
    const short = mintJoinTicket();
    expect(shortTicketCannotUnwrapFarmSeed(short)).toBe(true);
    expect(inviteTokenCannotUnwrapFarmSeed(short)).toBe(true);
    expect(inviteTokenCannotUnwrapFarmSeed(token)).toBe(true);

    const sealed = await wrapCrewJoinEnvelope(sampleEnvelope(token), token);
    await expect(unwrapCrewJoinEnvelope(sealed, short)).rejects.toThrow(/short ticket cannot open/);
    await expect(deriveCrewJoinSlotAddress(short)).rejects.toThrow(/short ticket cannot open/);
    await expect(wrapCrewJoinEnvelope(sampleEnvelope(short as never), short)).rejects.toThrow(
      /short ticket cannot open/,
    );
  });
});
