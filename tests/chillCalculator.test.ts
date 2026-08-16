import { describe, expect, it } from 'vitest';
import {
  applyDynamicModel,
  calculateDailyChill,
  generateHourly,
  parseDailyText,
} from '../shared/weather/chillCalculator';

describe('chill calculator (standalone port)', () => {
  it('parses AU daily CSV', () => {
    const rows = parseDailyText('Date,Tmax,Tmin\n01/05/2026,18.2,6.4\n02/05/2026,16.8,5.1');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.tmax).toBe(18.2);
    expect(rows[0]!.tmin).toBe(6.4);
    expect(rows[0]!.day.getMonth()).toBe(4);
  });

  it('synthesises 24 hourly temps per day', () => {
    const hourly = generateHourly(
      [{ day: new Date(2026, 4, 1), tmax: 18, tmin: 6 }],
      -34.25
    );
    expect(hourly).toHaveLength(24);
    const temps = hourly.map((h) => h.temp);
    expect(Math.max(...temps)).toBeLessThanOrEqual(18.01);
    expect(Math.min(...temps)).toBeGreaterThanOrEqual(5.5);
  });

  it('accumulates portions on a cool week', () => {
    const text = [
      'Date,Tmax,Tmin',
      ...Array.from({ length: 14 }, (_, i) => {
        const d = new Date(2026, 5, 1 + i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day},12,2`;
      }),
    ].join('\n');
    const out = calculateDailyChill(text, -34.25);
    expect(out.hours).toBe(14 * 24);
    expect(out.totalPortions).toBeGreaterThan(0);
    expect(out.days).toHaveLength(14);
  });

  it('returns zero portions for an empty hourly series', () => {
    expect(applyDynamicModel([])).toBe(0);
  });
});
