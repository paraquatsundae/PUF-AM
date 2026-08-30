import { describe, expect, it } from 'vitest';
import { groupHarvestsByBlock, harvestSeasonTotalKg, type HarvestRecord } from './harvestRecords';

function rec(partial: Partial<HarvestRecord> & Pick<HarvestRecord, 'id' | 'blockId' | 'totalWeight'>): HarvestRecord {
  return {
    date: '2026-03-01',
    moistureContent: 0,
    qualityGrade: '',
    notes: '',
    createdAt: '2026-03-01T00:00:00.000Z',
    createdBy: 'u1',
    ...partial,
  };
}

describe('harvestRecords', () => {
  it('groups records onto known blocks and keeps orphans', () => {
    const records = [
      rec({ id: 'a', blockId: 'b1', totalWeight: 10 }),
      rec({ id: 'b', blockId: 'gone', totalWeight: 4 }),
    ];
    const map = groupHarvestsByBlock(records, ['b1']);
    expect(map.b1.map((r) => r.id)).toEqual(['a']);
    expect(map.gone.map((r) => r.id)).toEqual(['b']);
  });

  it('sums season kg', () => {
    expect(
      harvestSeasonTotalKg([
        rec({ id: 'a', blockId: 'b1', totalWeight: 10 }),
        rec({ id: 'b', blockId: 'b1', totalWeight: 2.5 }),
      ])
    ).toBe(12.5);
  });
});
