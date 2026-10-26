import { describe, expect, it } from 'vitest';
import { loadsForBins, summarizeFieldBinHistory } from '../shared/farm/fieldBinHistory';
import type { FieldBinMovement } from '../shared/farm/fieldBinStock';

function movement(partial: Pick<FieldBinMovement, 'id' | 'at' | 'direction' | 'lines'>): FieldBinMovement {
  return { vehicleId: 'v', ...partial };
}

describe('field bin history', () => {
  it('sums a day and keeps a newer day first', () => {
    const { days } = summarizeFieldBinHistory({
      timeZone: 'UTC',
      stock: {},
      binPaddock: {},
      movements: [
        movement({
          id: 'a',
          at: '2026-10-26T01:00:00.000Z',
          direction: 'in',
          lines: [{ binId: 'b1', percent: 100, base: 'load', tonnes: 10 }],
        }),
        movement({
          id: 'b',
          at: '2026-10-26T05:00:00.000Z',
          direction: 'out',
          lines: [{ binId: 'b1', percent: 40, base: 'bin', tonnes: 4 }],
        }),
        movement({
          id: 'c',
          at: '2026-10-25T12:00:00.000Z',
          direction: 'in',
          lines: [{ binId: 'b1', percent: 100, base: 'load', tonnes: 20 }],
        }),
      ],
    });
    expect(days.map((day) => day.day)).toEqual(['2026-10-26', '2026-10-25']);
    expect(days[0]).toMatchObject({ inT: 10, outT: 4, loads: 2 });
    expect(days[1]).toMatchObject({ inT: 20, outT: 0, loads: 1 });
  });

  it('attributes loads and holding to the paddock the bin is in', () => {
    const { paddocks } = summarizeFieldBinHistory({
      timeZone: 'UTC',
      stock: { b1: { tonnes: 6 }, b2: { tonnes: 3 } },
      binPaddock: { b1: 'north', b2: null },
      movements: [
        movement({
          id: 'a',
          at: '2026-10-26T01:00:00.000Z',
          direction: 'in',
          lines: [
            { binId: 'b1', percent: 100, base: 'load', tonnes: 10 },
            { binId: 'b2', percent: 100, base: 'load', tonnes: 5 },
          ],
        }),
        movement({
          id: 'b',
          at: '2026-10-26T02:00:00.000Z',
          direction: 'out',
          lines: [{ binId: 'b1', percent: 40, base: 'bin', tonnes: 4 }],
        }),
      ],
    });
    const binOnly = loadsForBins(
      [
        movement({
          id: 'truck',
          at: '2026-10-26T09:00:00.000Z',
          direction: 'out',
          lines: [
            { binId: 'b1', percent: 50, base: 'trailer', tonnes: 22 },
            { binId: 'b2', percent: 100, base: 'trailer', tonnes: 25 },
          ],
        }),
      ],
      new Set(['b1'])
    );
    expect(binOnly[0]?.movement.lines.map((line) => line.tonnes)).toEqual([22]);
    expect(binOnly[0]?.alsoBinIds).toEqual(['b2']);

    expect(paddocks).toEqual([
      { paddockId: 'north', inT: 10, outT: 4, holdingT: 6, binIds: ['b1'] },
      { paddockId: null, inT: 5, outT: 0, holdingT: 3, binIds: ['b2'] },
    ]);
  });
});
