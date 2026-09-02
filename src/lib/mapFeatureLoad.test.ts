import { describe, expect, it } from 'vitest';
import { MAP_FEATURE_WARN_THRESHOLD, assessMapFeatureLoad } from './mapFeatureLoad';

const geometry = (blocks: number, pins: number, tracks: number) => ({
  blocks: new Array(blocks).fill(null),
  pins: new Array(pins).fill(null),
  tracks: new Array(tracks).fill(null),
});

describe('assessMapFeatureLoad', () => {
  it('stays quiet for an empty farm', () => {
    expect(assessMapFeatureLoad(geometry(0, 0, 0))).toBeNull();
  });

  it('stays quiet at the threshold', () => {
    expect(assessMapFeatureLoad(geometry(MAP_FEATURE_WARN_THRESHOLD, 0, 0))).toBeNull();
  });

  it('warns one feature past the threshold', () => {
    const load = assessMapFeatureLoad(geometry(MAP_FEATURE_WARN_THRESHOLD + 1, 0, 0));
    expect(load?.total).toBe(MAP_FEATURE_WARN_THRESHOLD + 1);
  });

  it('counts blocks, pins and tracks together, not separately', () => {
    // None of these alone crosses 500; the rendered total does.
    const load = assessMapFeatureLoad(geometry(300, 150, 100));

    expect(load).not.toBeNull();
    expect(load?.total).toBe(550);
    expect(load?.blocks).toBe(300);
    expect(load?.pins).toBe(150);
    expect(load?.tracks).toBe(100);
  });

  it('names each collection in the message so the operator knows what is heavy', () => {
    const load = assessMapFeatureLoad(geometry(300, 150, 100));

    expect(load?.message).toContain('550 features');
    expect(load?.message).toContain('300 blocks');
    expect(load?.message).toContain('150 pins');
    expect(load?.message).toContain('100 tracks');
  });

  it('honours a caller-supplied threshold', () => {
    expect(assessMapFeatureLoad(geometry(5, 3, 2), 10)).toBeNull();
    expect(assessMapFeatureLoad(geometry(5, 3, 2), 9)?.total).toBe(10);
  });
});
