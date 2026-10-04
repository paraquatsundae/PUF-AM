export type DendrometerReading = {
  date: string;
  sensorA: number;
  sensorB: number;
};

const DAY_MS = 86_400_000;

function roundMillimetres(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Stable demonstration fixture: one daily reading per sensor from 2024-09-01
 * through 2026-08-31. It deliberately has no clock, network, or storage input.
 */
export const DEMO_DENDROMETER_SERIES: readonly DendrometerReading[] = Array.from(
  { length: 730 },
  (_, day) => {
    const date = new Date(Date.UTC(2024, 8, 1) + day * DAY_MS);
    const annual = Math.sin((day / 365.25) * Math.PI * 2);
    const weekly = Math.sin((day / 7) * Math.PI * 2);
    const growthA = day * 0.011;
    const growthB = day * 0.009;

    return {
      date: date.toISOString().slice(0, 10),
      sensorA: roundMillimetres(61.8 + growthA + annual * 0.7 + weekly * 0.08),
      sensorB: roundMillimetres(58.4 + growthB + annual * 0.55 + weekly * 0.06),
    };
  }
);

export const DEMO_RANGE_START = DEMO_DENDROMETER_SERIES[0].date;
export const DEMO_RANGE_END = DEMO_DENDROMETER_SERIES.at(-1)!.date;
