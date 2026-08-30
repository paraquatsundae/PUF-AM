import { describe, expect, it } from 'vitest';
import { irrigationEventsByDate, sprayEventsByDate } from './farmDiaryAnalytics';
import type { DiaryEvent } from './farmDiaryTypes';

function ev(partial: Partial<DiaryEvent> & Pick<DiaryEvent, 'id' | 'date' | 'type'>): DiaryEvent {
  return partial as DiaryEvent;
}

describe('farmDiaryAnalytics', () => {
  it('merges chem + bio on the same day as both and keeps the higher-penetration method', () => {
    const events = [
      ev({
        id: '1',
        date: '2026-08-01',
        type: 'spray',
        sprayType: 'chem',
        applicationMethod: 'ground',
        blockId: 'b1',
      }),
      ev({
        id: '2',
        date: '2026-08-01',
        type: 'spray',
        sprayType: 'bio',
        applicationMethod: 'helicopter',
        blockId: 'b1',
      }),
    ];
    expect(sprayEventsByDate(events, 'b1')['2026-08-01']).toEqual({
      type: 'both',
      method: 'helicopter',
    });
  });

  it('includes farm-wide sprays (no blockId) for every block', () => {
    const events = [
      ev({ id: '1', date: '2026-08-02', type: 'spray', sprayType: 'chem', applicationMethod: 'drone' }),
    ];
    expect(sprayEventsByDate(events, 'b9')['2026-08-02']?.type).toBe('chem');
  });

  it('sums irrigation mm per day and ignores other types', () => {
    const events = [
      ev({ id: '1', date: '2026-08-03', type: 'irrigation', irrigationAmount: 4, blockId: 'b1' }),
      ev({ id: '2', date: '2026-08-03', type: 'irrigation', irrigationAmount: 2, blockId: 'b1' }),
      ev({ id: '3', date: '2026-08-03', type: 'spray', sprayType: 'chem' }),
    ];
    expect(irrigationEventsByDate(events, 'b1')).toEqual({ '2026-08-03': 6 });
  });
});
