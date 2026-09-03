import { describe, expect, it } from 'vitest';
import {
  addDaysIso,
  filterBySeasonAndRange,
  filterSandboxScenarioDays,
  formatRiskValue,
  getCurrentSeasonStr,
  mergeObservedAndForecast,
  seasonBounds,
  todayDateStr,
} from './blightSeason';

describe('blightSeason', () => {
  it('names the Jul–Jun season from a calendar date', () => {
    expect(getCurrentSeasonStr(new Date('2026-07-01T12:00:00'))).toBe('2026-27');
    expect(getCurrentSeasonStr(new Date('2026-06-30T12:00:00'))).toBe('2025-26');
  });

  it('formats tiny Ji risk without collapsing to 0.00', () => {
    expect(formatRiskValue(0)).toBe('0');
    expect(formatRiskValue(0.0004)).toBe('4.0e-4');
    expect(formatRiskValue(0.012)).toBe('0.012');
    expect(formatRiskValue(1.234)).toBe('1.23');
  });

  it('filters a Jul–Jun season and custom month window', () => {
    const { seasonStart } = seasonBounds('2025-26');
    const rows = [
      { timestamp: seasonStart, fullDate: '2025-07-01' },
      { timestamp: new Date('2026-01-15T12:00:00Z').getTime(), fullDate: '2026-01-15' },
      { timestamp: new Date('2024-08-01T12:00:00Z').getTime(), fullDate: '2024-08-01' },
    ];
    const year = filterBySeasonAndRange(rows, {
      selectedSeason: '2025-26',
      timeRange: '1Y',
      customStartMonth: 0,
      customEndMonth: 11,
    });
    expect(year.map((r) => r.fullDate)).toEqual(['2025-07-01', '2026-01-15']);

    const custom = filterBySeasonAndRange(rows, {
      selectedSeason: '2025-26',
      timeRange: 'Custom',
      customStartMonth: 0,
      customEndMonth: 2,
    });
    expect(custom.map((r) => r.fullDate)).toEqual(['2025-07-01']);
  });

  it('merges forecast days after the last observation', () => {
    const merged = mergeObservedAndForecast(
      { '2026-08-01': { t: 1 } },
      { '2026-08-01': { t: 9 }, '2026-08-02': { t: 2 } }
    );
    expect(merged['2026-08-01']).toEqual({ t: 1 });
    expect(merged['2026-08-02']).toEqual({ t: 2 });
  });

  it('filters sandbox scenario days by forecast horizon or Jul–Jun season', () => {
    const rows = [
      { fullDate: '2025-08-01', timestamp: Date.parse('2025-08-01T12:00:00Z') },
      { fullDate: '2026-08-20', timestamp: Date.parse('2026-08-20T12:00:00Z') },
      { fullDate: '2026-08-28', timestamp: Date.parse('2026-08-28T12:00:00Z') },
    ];
    const forecast = filterSandboxScenarioDays(rows, {
      sandboxView: 'forecast',
      todayStr: '2026-08-27',
      selectedSeason: '2025-26',
    });
    expect(forecast.map((r) => r.fullDate)).toEqual(['2026-08-28']);

    const historical = filterSandboxScenarioDays(rows, {
      sandboxView: 'historical',
      todayStr: '2026-08-27',
      selectedSeason: '2025-26',
    });
    expect(historical.map((r) => r.fullDate)).toEqual(['2025-08-01']);
  });

  it('formats local today and adds days on an ISO date', () => {
    expect(todayDateStr(new Date(2026, 7, 27))).toBe('2026-08-27');
    expect(addDaysIso('2026-08-27', 7)).toBe('2026-09-03');
  });
});
