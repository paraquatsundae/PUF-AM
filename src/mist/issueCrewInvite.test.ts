import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deriveBonesContractKey, deriveHotContractKey } from '../../units/mist-freenet/src/index.ts';
import { bytesToHex, hexToBytes } from '../../units/mist-freenet/src/farm-seed.ts';
import { unwrapCrewJoinEnvelope } from '../../units/mist-freenet/src/crew-join.ts';
import { findJoinPreset } from '../../shared/sync/joinGrant.ts';
import { describeTicketRouteGap } from './issueCrewInvite.ts';

const registerJoinTicketOnLan = vi.fn();
const resolveLan = vi.fn();
const publishCrewInviteToFreenetSlot = vi.fn();
const saveJoinTicketForFarm = vi.fn();

vi.mock('./joinTicketResolver.ts', () => ({
  registerJoinTicketOnLan: (...args: unknown[]) => registerJoinTicketOnLan(...args),
  LanJoinTicketResolver: class {
    resolve(...args: unknown[]) {
      return resolveLan(...args);
    }
  },
}));

vi.mock('./crewJoinSlot.ts', () => ({
  publishCrewInviteToFreenetSlot: (...args: unknown[]) => publishCrewInviteToFreenetSlot(...args),
}));

vi.mock('./mistHotPublishMeta.ts', () => ({
  saveJoinTicketForFarm: (...args: unknown[]) => saveJoinTicketForFarm(...args),
}));

const { issueCrewInvite } = await import('./issueCrewInvite.ts');

const FARM_SEED = new Uint8Array(32).fill(7);

describe('issueCrewInvite', () => {
  beforeEach(() => {
    registerJoinTicketOnLan.mockReset();
    resolveLan.mockReset();
    publishCrewInviteToFreenetSlot.mockReset();
    saveJoinTicketForFarm.mockReset();
    registerJoinTicketOnLan.mockResolvedValue({ ticket: 'ok' });
    resolveLan.mockResolvedValue({ farmId: 'farm-1' });
    publishCrewInviteToFreenetSlot.mockResolvedValue({ mode: 'put' });
  });

  it('registers a sealed crew envelope with no FarmSeed', async () => {
    const result = await issueCrewInvite({
      farmId: 'farm-1',
      farmSeed: FARM_SEED,
      hotUri: 'FN02@hot',
      bonesUri: 'FN02@bones',
      label: 'Dave',
      preset: findJoinPreset('full_farmer') ?? undefined,
    });

    expect(result.shortTicket).toMatch(/^PUF-/);
    expect(result.shortTicketOnLan).toBe(true);
    expect(result.shortTicketOnFreenet).toBe('put');
    expect(saveJoinTicketForFarm).toHaveBeenCalled();

    const registered = registerJoinTicketOnLan.mock.calls[0]?.[0] as {
      label?: string;
      sealedCrew?: string;
    };
    expect(registered.label).toBe('Dave');
    expect(registered.sealedCrew).toBeTruthy();
    const opened = await unwrapCrewJoinEnvelope(hexToBytes(registered.sealedCrew!), result.shortTicket!);
    expect(opened.hotKeyHex).toBe(bytesToHex(await deriveHotContractKey(FARM_SEED)));
    expect(opened.bonesKeyHex).toBe(bytesToHex(await deriveBonesContractKey(FARM_SEED)));
    expect(opened).not.toHaveProperty('farmSeedHex');
    expect(JSON.stringify(opened)).not.toContain(bytesToHex(FARM_SEED));
  });
});

describe('describeTicketRouteGap', () => {
  it('names which route failed', () => {
    expect(describeTicketRouteGap({})).toBeUndefined();
    expect(describeTicketRouteGap({ freenetError: 'timeout' })).toMatch(/not off it/);
    expect(describeTicketRouteGap({ lanError: 'hub down' })).toMatch(/off this Wi‑Fi/);
  });
});
