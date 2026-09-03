import { describe, it, expect } from 'vitest';
import type { DailyData } from '../plugins/walnut_blight/src/blightModel';
import {
  bandFromRisk,
  detectInfectionEvents,
  summarizeNext7Days,
  computeSymptomOnsetSeries,
  symptomWindowForEvent,
  INCUBATION_MIN_DAYS,
  INCUBATION_MAX_DAYS,
  JI_WATCH_THRESHOLD,
  JI_ACTION_THRESHOLD,
} from '../plugins/walnut_blight/src/jiBlightBands';

function day(fullDate: string, threat: number, extras: Partial<DailyData> = {}): DailyData {
  const [y, m, d] = fullDate.split('-').map(Number);
  const ts = new Date(y, m - 1, d).getTime();
  return {
    dateStr: fullDate,
    fullDate,
    timestamp: ts,
    year: y,
    month: m - 1,
    threat,
    latentThreat: 0,
    eruptingThreat: 0,
    daysToEruption: null,
    chem: 0,
    bio: 0,
    isSprayDay: false,
    T: 18,
    RH: 90,
    R: 5,
    WD: 12,
    ...extras,
  };
}

describe('bandFromRisk', () => {
  it('maps Quiet / Watch / Action', () => {
    expect(bandFromRisk(0)).toBe('quiet');
    expect(bandFromRisk(JI_WATCH_THRESHOLD)).toBe('watch');
    expect(bandFromRisk(JI_ACTION_THRESHOLD)).toBe('action');
  });
});

describe('detectInfectionEvents', () => {
  it('groups contiguous Watch+ days and picks peak drivers', () => {
    const series = [
      day('2025-10-01', 0),
      day('2025-10-02', 0.003, { T: 16, R: 2, WD: 8 }),
      day('2025-10-03', 0.02, { T: 17, R: 12, WD: 14 }),
      day('2025-10-04', 0.004),
      day('2025-10-05', 0),
      day('2025-10-08', 0.015, { T: 19, R: 8, WD: 11 }),
    ];
    const events = detectInfectionEvents(series);
    expect(events).toHaveLength(2);
    expect(events[0].dayCount).toBe(3);
    expect(events[0].band).toBe('action');
    expect(events[0].peakDate).toBe('2025-10-03');
    expect(events[0].R).toBe(12);
    expect(events[1].peakDate).toBe('2025-10-08');
  });
});

describe('computeSymptomOnsetSeries', () => {
  it('lags a single infection spike into the 15–21 day window', () => {
    // One unit of infection risk on 2025-10-01, dry otherwise.
    const series: DailyData[] = [];
    for (let i = 0; i < 40; i++) {
      const d = String(i + 1).padStart(2, '0');
      series.push(day(`2025-10-${d}`, i === 0 ? 0.7 : 0));
    }
    const onset = computeSymptomOnsetSeries(series);

    // Before the incubation window opens: nothing.
    expect(onset.get('2025-10-15')).toBe(0); // 14 days after → still latent
    // Inside the window (15–21 days after 10-01 → 10-16 .. 10-22): spread value.
    const perDay = 0.7 / (INCUBATION_MAX_DAYS - INCUBATION_MIN_DAYS + 1);
    expect(onset.get('2025-10-16')).toBeCloseTo(perDay, 10); // exactly 15 days later
    expect(onset.get('2025-10-22')).toBeCloseTo(perDay, 10); // exactly 21 days later
    // After the window closes: back to zero.
    expect(onset.get('2025-10-23')).toBe(0);
  });

  it('conserves total infection mass across the lag', () => {
    const series: DailyData[] = [];
    for (let i = 0; i < 60; i++) {
      const d = new Date(2025, 9, 1 + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      series.push(day(iso, i < 5 ? 0.2 : 0));
    }
    const onset = computeSymptomOnsetSeries(series);
    const totalIn = series.reduce((s, d) => s + d.threat, 0);
    const totalOut = [...onset.values()].reduce((s, v) => s + v, 0);
    // Uniform spread conserves mass except for events whose window runs past the series end.
    expect(totalOut).toBeCloseTo(totalIn, 6);
  });
});

describe('symptomWindowForEvent', () => {
  it('offsets the event by the incubation window', () => {
    const w = symptomWindowForEvent({
      startDate: '2025-10-01',
      endDate: '2025-10-03',
      peakDate: '2025-10-02',
    });
    expect(w.startDate).toBe('2025-10-16'); // +15
    expect(w.endDate).toBe('2025-10-24'); // +21
    expect(w.peakDate).toBe('2025-10-20'); // +18 (midpoint)
  });
});

describe('summarizeNext7Days', () => {
  it('counts bands and finds next Action day', () => {
    const days = [
      day('2026-07-18', 0.001),
      day('2026-07-19', 0.003),
      day('2026-07-20', 0.012),
      day('2026-07-21', 0),
    ];
    const o = summarizeNext7Days(days);
    expect(o.outlookBand).toBe('action');
    expect(o.actionDays).toBe(1);
    expect(o.watchDays).toBe(1);
    expect(o.nextAction?.fullDate).toBe('2026-07-20');
    expect(o.isPersistence).toBe(true);
  });
});
