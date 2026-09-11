/**
 * The hybrid farm-doc field — `farms/{farmId}.networkPacks.freenet_host`.
 *
 * There is no Firestore rules emulator harness in this repo, so the writer is
 * tested as the pure patch builder the pack hands to `updateDoc`, and the rules
 * file is checked as text the way `tests/inviteBinding.test.ts` does.
 *
 * @see Plans/FREENET_NETWORK_PACK.md §3
 * @see Plans/NAMING.md §8
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  farmFreenetHostState,
  isFarmFreenetHostEnabled,
  planFreenetHostFarmDocUpdate,
  resolveFarmNetworkPacks,
} from '../shared/farm/networkPacks';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

describe('resolveFarmNetworkPacks', () => {
  it('reads a well-formed map off the farm doc', () => {
    const packs = resolveFarmNetworkPacks({
      freenet_host: {
        enabled: true,
        mistFarmId: 'mist-abc',
        changedAt: '2026-09-11T00:00:00.000Z',
        changedBy: 'uid-1',
      },
    });
    expect(farmFreenetHostState(packs)).toEqual({
      enabled: true,
      mistFarmId: 'mist-abc',
      changedAt: '2026-09-11T00:00:00.000Z',
      changedBy: 'uid-1',
    });
    expect(isFarmFreenetHostEnabled(packs)).toBe(true);
  });

  it('treats anything malformed as absent rather than throwing', () => {
    expect(resolveFarmNetworkPacks(undefined)).toEqual({});
    expect(resolveFarmNetworkPacks('nope')).toEqual({});
    expect(resolveFarmNetworkPacks({ freenet_host: 'on' })).toEqual({});
    // No mist id means no mirror to speak of, whatever `enabled` says.
    expect(resolveFarmNetworkPacks({ freenet_host: { enabled: true } })).toEqual({});
    expect(isFarmFreenetHostEnabled(resolveFarmNetworkPacks({ freenet_host: { enabled: true } }))).toBe(false);
  });

  it('only a literal true counts as enabled', () => {
    const packs = resolveFarmNetworkPacks({ freenet_host: { enabled: 'yes', mistFarmId: 'm' } });
    expect(isFarmFreenetHostEnabled(packs)).toBe(false);
  });
});

describe('planFreenetHostFarmDocUpdate', () => {
  const now = new Date('2026-09-11T03:04:05.000Z');

  it('enables on a dotted path so nothing else on the doc is rewritten', () => {
    const patch = planFreenetHostFarmDocUpdate({
      enabled: true,
      mistFarmId: 'mist-abc',
      current: null,
      changedBy: 'uid-1',
      now,
    });
    expect(Object.keys(patch)).toEqual(['networkPacks.freenet_host']);
    expect(patch['networkPacks.freenet_host']).toEqual({
      enabled: true,
      mistFarmId: 'mist-abc',
      changedAt: '2026-09-11T03:04:05.000Z',
      changedBy: 'uid-1',
    });
  });

  it('disable keeps the stored mistFarmId so the same FarmCode re-enables', () => {
    const patch = planFreenetHostFarmDocUpdate({
      enabled: false,
      current: { enabled: true, mistFarmId: 'mist-abc', changedAt: '', changedBy: 'x' },
      changedBy: 'uid-2',
      now,
    });
    expect(patch['networkPacks.freenet_host']).toMatchObject({
      enabled: false,
      mistFarmId: 'mist-abc',
      changedBy: 'uid-2',
    });
  });

  it('a fresh mint replaces the stored id', () => {
    const patch = planFreenetHostFarmDocUpdate({
      enabled: true,
      mistFarmId: 'mist-new',
      current: { enabled: false, mistFarmId: 'mist-old', changedAt: '', changedBy: 'x' },
      changedBy: 'uid-1',
      now,
    });
    expect(patch['networkPacks.freenet_host']!.mistFarmId).toBe('mist-new');
  });

  it('refuses to write without a mist id or a uid', () => {
    expect(() =>
      planFreenetHostFarmDocUpdate({ enabled: true, current: null, changedBy: 'uid-1' }),
    ).toThrow(/mist FarmId/);
    expect(() =>
      planFreenetHostFarmDocUpdate({ enabled: true, mistFarmId: 'm', current: null, changedBy: ' ' }),
    ).toThrow(/uid/);
  });

  it('never carries a seed — the patch has exactly the four documented keys', () => {
    const patch = planFreenetHostFarmDocUpdate({
      enabled: true,
      mistFarmId: 'mist-abc',
      current: null,
      changedBy: 'uid-1',
      now,
    });
    expect(Object.keys(patch['networkPacks.freenet_host']!).sort()).toEqual([
      'changedAt',
      'changedBy',
      'enabled',
      'mistFarmId',
    ]);
  });
});

describe('firestore.rules admits networkPacks on the farm doc', () => {
  it('lists networkPacks among the allowed farm fields and requires a map', () => {
    const isValidFarm = rules.slice(rules.indexOf('function isValidFarm'));
    const body = isValidFarm.slice(0, isValidFarm.indexOf('\n    }'));
    expect(body).toContain("'networkPacks'");
    expect(body).toContain("(!('networkPacks' in data) || data.networkPacks is map)");
  });

  it('keeps farm-doc writes to farm admins (same authority as cropPacks)', () => {
    const farmMatch = rules.slice(rules.indexOf('match /farms/{farmId} {'));
    const head = farmMatch.slice(0, farmMatch.indexOf('match /blocks/'));
    expect(head).toMatch(/allow update: if canMutateFarm\(farmId\) && isFarmAdmin\(farmId\)/);
    expect(head).toMatch(/allow read: if isFarmMember\(farmId\)/);
  });
});
