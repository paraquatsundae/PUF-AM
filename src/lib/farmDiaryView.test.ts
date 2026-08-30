import { describe, expect, it } from 'vitest';
import type { DiaryEvent } from './farmDiary';
import {
  diaryEventStatus,
  diaryEventsToCsv,
  filterDiaryEvents,
  groupEventsByBlock,
  sortDiaryBlockIds,
  todayInputDate,
} from './farmDiaryView';

function ev(partial: Partial<DiaryEvent> & Pick<DiaryEvent, 'id' | 'date' | 'type'>): DiaryEvent {
  return partial as DiaryEvent;
}

describe('farmDiaryView', () => {
  it('formats a local calendar date for inputs and CSV names', () => {
    expect(todayInputDate(new Date(2026, 7, 27))).toBe('2026-08-27');
  });

  it('defaults work to planned and other types to done', () => {
    expect(diaryEventStatus({ type: 'work' })).toBe('planned');
    expect(diaryEventStatus({ type: 'spray' })).toBe('done');
    expect(diaryEventStatus({ type: 'work', status: 'done' })).toBe('done');
  });

  it('filters by type, planned-only, search, and focused block', () => {
    const events = [
      ev({ id: '1', date: '2026-08-01', type: 'work', status: 'planned', title: 'Fix drip', blockId: 'b1' }),
      ev({ id: '2', date: '2026-08-02', type: 'work', status: 'done', title: 'Fixed drip', blockId: 'b1' }),
      ev({ id: '3', date: '2026-08-03', type: 'spray', sprayType: 'chem', agentName: 'Copper', blockId: 'b2' }),
      ev({ id: '4', date: '2026-08-04', type: 'irrigation', irrigationAmount: 8, notes: 'overnight' }),
    ];

    expect(filterDiaryEvents(events, { filter: 'plans', searchQuery: '', focusBlockId: null }).map((e) => e.id)).toEqual([
      '1',
    ]);
    expect(filterDiaryEvents(events, { filter: 'work', searchQuery: '', focusBlockId: null }).map((e) => e.id)).toEqual([
      '1',
      '2',
    ]);
    expect(filterDiaryEvents(events, { filter: 'spray', searchQuery: 'copper', focusBlockId: null }).map((e) => e.id)).toEqual([
      '3',
    ]);
    expect(filterDiaryEvents(events, { filter: 'all', searchQuery: '', focusBlockId: 'b1' }).map((e) => e.id)).toEqual([
      '1',
      '2',
    ]);
  });

  it('groups by block and sorts focus, then general, then name', () => {
    const grouped = groupEventsByBlock([
      ev({ id: '1', date: '2026-08-01', type: 'spray', blockId: 'north' }),
      ev({ id: '2', date: '2026-08-02', type: 'work' }),
      ev({ id: '3', date: '2026-08-03', type: 'spray', blockId: 'south' }),
    ]);
    expect(Object.keys(grouped)).toEqual(['north', 'general', 'south']);

    const blocks = [
      { id: 'south', name: 'South' },
      { id: 'north', name: 'North' },
    ];
    expect(sortDiaryBlockIds(grouped, null, blocks)).toEqual(['general', 'north', 'south']);
    expect(sortDiaryBlockIds(grouped, 'south', blocks)).toEqual(['south', 'general', 'north']);
    expect(sortDiaryBlockIds({}, 'empty', blocks)).toEqual(['empty']);
  });

  it('builds a quoted CSV with NPK and title fallbacks', () => {
    const csv = diaryEventsToCsv([
      ev({
        id: '1',
        date: '2026-08-01',
        type: 'nutrition',
        productName: 'MAP',
        rate: 120,
        rateUnit: 'kg/ha',
        nRate: 10,
        pRate: 22,
        notes: 'east rows',
      }),
      ev({ id: '2', date: '2026-08-02', type: 'work', title: 'Scout' }),
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Title/Product');
    expect(lines[1]).toContain('"MAP"');
    expect(lines[1]).toContain('"120 kg/ha"');
    expect(lines[1]).toContain('"N10 P22"');
    expect(lines[2]).toContain('"Scout"');
    expect(lines[2]).toContain('"planned"');
  });
});
