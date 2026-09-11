/**
 * Join-gate branching on the manifest's hybrid marker, and the manifest field
 * itself surviving the parser both routes use.
 *
 * @see Plans/FREENET_NETWORK_PACK.md §3
 */
import { describe, expect, it } from 'vitest';

import { parseJoinManifestV2 } from '../shared/sync/joinTicket.ts';
import { describeJoinOutcome, joinOutcomeMessage } from '../plugins/freenet_host/src/joinOutcome';

const base = {
  v: 2,
  farmId: 'mist-1',
  hotUri: 'FN02@hot',
  bonesUri: 'FN02@bones',
  role: 'farmer',
  ticket: 'PUF-K7M2-9Q4X',
};

describe('parseJoinManifestV2 — cloudFarmId', () => {
  it('passes a hybrid marker through', () => {
    const m = parseJoinManifestV2({ ...base, cloudFarmId: ' cloud-1 ' });
    expect(m?.cloudFarmId).toBe('cloud-1');
  });

  it('omits the key entirely for a Freenet-native manifest', () => {
    const m = parseJoinManifestV2(base);
    expect(m).not.toBeNull();
    expect('cloudFarmId' in m!).toBe(false);
    expect(parseJoinManifestV2({ ...base, cloudFarmId: '' })?.cloudFarmId).toBeUndefined();
    expect(parseJoinManifestV2({ ...base, cloudFarmId: 42 })?.cloudFarmId).toBeUndefined();
  });
});

describe('describeJoinOutcome', () => {
  it('a manifest naming a cloud farm lands a read-only mirror', () => {
    expect(describeJoinOutcome({ manifest: { cloudFarmId: 'cloud-1' } })).toEqual({
      kind: 'mirror',
      cloudFarmId: 'cloud-1',
    });
  });

  it('falls back to the Hot blob provenance for a ticket minted without the field', () => {
    expect(describeJoinOutcome({ manifest: {}, hotCloudFarmId: 'cloud-1' })).toEqual({
      kind: 'mirror',
      cloudFarmId: 'cloud-1',
    });
  });

  it('a Freenet-native farm makes a member', () => {
    expect(describeJoinOutcome({ manifest: {} })).toEqual({ kind: 'member' });
    expect(describeJoinOutcome({ manifest: { cloudFarmId: '  ' }, hotCloudFarmId: null })).toEqual({ kind: 'member' });
  });

  it('the manifest wins over the blob when both speak', () => {
    expect(describeJoinOutcome({ manifest: { cloudFarmId: 'cloud-a' }, hotCloudFarmId: 'cloud-b' })).toEqual({
      kind: 'mirror',
      cloudFarmId: 'cloud-a',
    });
  });
});

describe('joinOutcomeMessage', () => {
  it('says mirror, read-only, invite PIN for a hybrid join', () => {
    const text = joinOutcomeMessage(
      { kind: 'mirror', cloudFarmId: 'cloud-1' },
      { diary: 1, blocks: 2, joinedAs: 'Full farmer' },
    );
    expect(text).toContain('This is a mirror of a cloud farm');
    expect(text).toContain('read-only');
    expect(text).toContain('join with an invite PIN');
    expect(text).toContain('1 diary entry');
    expect(text).toContain('2 blocks');
    expect(text).not.toContain('Joined as');
  });

  it('keeps the member sentence for a Freenet farm', () => {
    expect(joinOutcomeMessage({ kind: 'member' }, { diary: 3, blocks: 1, joinedAs: 'Crop scout' })).toBe(
      'Joined as Crop scout — 3 diary entries and 1 block are on this device.',
    );
  });
});
