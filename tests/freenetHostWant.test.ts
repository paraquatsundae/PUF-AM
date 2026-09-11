/**
 * `computeFreenetHostWant` — the reconciler's `want` with the hybrid inputs.
 *
 * @see Plans/FREENET_NETWORK_PACK.md §3
 * @see Plans/NETWORK_PACK_PLUGIN.md § Enable semantics
 */
import { describe, expect, it } from 'vitest';

import type { FarmNetworkPacksMap } from '../shared/farm/networkPacks';
import {
  computeFreenetHostWant,
  type FreenetHostWantInput,
} from '../plugins/freenet_host/src/freenetHostWant';

const ON: FarmNetworkPacksMap = {
  freenet_host: { enabled: true, mistFarmId: 'mist-1', changedAt: '', changedBy: 'u' },
};
const OFF: FarmNetworkPacksMap = {
  freenet_host: { enabled: false, mistFarmId: 'mist-1', changedAt: '', changedBy: 'u' },
};

function input(patch: Partial<FreenetHostWantInput>): FreenetHostWantInput {
  return {
    farmId: 'cloud-1',
    pipe: 'hybrid',
    cloudMirror: false,
    localEnabled: true,
    farmNetworkPacks: ON,
    seedCloudFarmId: 'cloud-1',
    capability: 'electron',
    ...patch,
  };
}

describe('computeFreenetHostWant — hybrid member device', () => {
  it('wants a node when the farm doc says on and this device holds the seed for this farm', () => {
    expect(computeFreenetHostWant(input({}))).toBe(true);
  });

  it('does not want a node when the farm doc says off', () => {
    expect(computeFreenetHostWant(input({ farmNetworkPacks: OFF }))).toBe(false);
  });

  it('does not want a node when the farm doc has no entry at all', () => {
    expect(computeFreenetHostWant(input({ farmNetworkPacks: {} }))).toBe(false);
    expect(computeFreenetHostWant(input({ farmNetworkPacks: null }))).toBe(false);
  });

  it('does not want a node without the seed on this device', () => {
    expect(computeFreenetHostWant(input({ seedCloudFarmId: null }))).toBe(false);
  });

  it('a seed for a different cloud farm does not count', () => {
    expect(computeFreenetHostWant(input({ seedCloudFarmId: 'cloud-2' }))).toBe(false);
  });

  it('ignores the local per-farm flag — the farm doc is the authority here', () => {
    expect(computeFreenetHostWant(input({ localEnabled: false }))).toBe(true);
  });
});

describe('computeFreenetHostWant — the other shapes', () => {
  it('a mirror device follows its local flag, like a Freenet farm', () => {
    expect(computeFreenetHostWant(input({ cloudMirror: true, farmNetworkPacks: {} }))).toBe(true);
    expect(computeFreenetHostWant(input({ cloudMirror: true, localEnabled: false }))).toBe(false);
  });

  it('a Freenet-native farm follows its local flag and never the farm doc', () => {
    expect(computeFreenetHostWant(input({ pipe: 'freenet', farmNetworkPacks: {} }))).toBe(true);
    expect(computeFreenetHostWant(input({ pipe: 'freenet', localEnabled: false }))).toBe(false);
  });

  it('a plain cloud farm never wants a node', () => {
    expect(computeFreenetHostWant(input({ pipe: 'cloud' }))).toBe(false);
  });

  it('no capability, no node — whatever the farm says', () => {
    expect(computeFreenetHostWant(input({ capability: null }))).toBe(false);
    expect(computeFreenetHostWant(input({ capability: 'android' }))).toBe(false);
  });

  it('no farm open, no node', () => {
    expect(computeFreenetHostWant(input({ farmId: null }))).toBe(false);
  });
});
