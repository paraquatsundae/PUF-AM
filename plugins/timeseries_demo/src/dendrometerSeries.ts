import type { DendrometerReading } from './demoSeries';

export type NormalizedDendrometerReading = DendrometerReading & {
  sensorANormalized: number;
  sensorBNormalized: number;
};

export function filterDendrometerSeries(
  readings: readonly DendrometerReading[],
  from: string,
  to: string
): DendrometerReading[] {
  return readings.filter((reading) => reading.date >= from && reading.date <= to);
}

export function normalizeDendrometersByRangeMinimum(
  readings: readonly DendrometerReading[]
): NormalizedDendrometerReading[] {
  if (readings.length === 0) return [];

  const sensorAMin = Math.min(...readings.map((reading) => reading.sensorA));
  const sensorBMin = Math.min(...readings.map((reading) => reading.sensorB));

  return readings.map((reading) => ({
    ...reading,
    sensorANormalized: Math.round((reading.sensorA - sensorAMin) * 100) / 100,
    sensorBNormalized: Math.round((reading.sensorB - sensorBMin) * 100) / 100,
  }));
}
