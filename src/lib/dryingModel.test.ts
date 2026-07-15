import { describe, it, expect } from "vitest";
import { calculateDryingPrediction } from "./dryingModel";

describe("calculateDryingPrediction", () => {
  it("returns null with fewer than two readings", () => {
    expect(
      calculateDryingPrediction([{ time: "2026-04-01T08:00:00.000Z", moisture: 10 }], 4)
    ).toBeNull();
  });

  it("returns null when moisture is not decaying", () => {
    const readings = [
      { time: "2026-04-01T08:00:00.000Z", moisture: 10 },
      { time: "2026-04-02T08:00:00.000Z", moisture: 10.5 },
    ];
    expect(calculateDryingPrediction(readings, 4)).toBeNull();
  });

  it("predicts target moisture date for decaying bin readings", () => {
    const readings = [
      { time: "2026-04-01T08:00:00.000Z", moisture: 12 },
      { time: "2026-04-02T08:00:00.000Z", moisture: 10 },
      { time: "2026-04-03T08:00:00.000Z", moisture: 8.5 },
      { time: "2026-04-04T08:00:00.000Z", moisture: 7.2 },
    ];

    const prediction = calculateDryingPrediction(readings, 4.0);
    expect(prediction).not.toBeNull();
    expect(prediction!.k).toBeGreaterThan(0);
    expect(prediction!.m0).toBeGreaterThan(4);
    expect(prediction!.targetHours).toBeGreaterThan(0);
    expect(prediction!.targetDate.getTime()).toBeGreaterThan(
      new Date(readings[0].time).getTime()
    );
    expect(prediction!.plotData.some((p) => p.measured !== null)).toBe(true);
  });

  it("fits exponential decay close to observed final reading", () => {
    const readings = [
      { time: "2026-04-01T00:00:00.000Z", moisture: 14 },
      { time: "2026-04-02T00:00:00.000Z", moisture: 11 },
      { time: "2026-04-03T00:00:00.000Z", moisture: 9 },
      { time: "2026-04-04T00:00:00.000Z", moisture: 7.5 },
    ];

    const prediction = calculateDryingPrediction(readings, 4.0)!;
    const lastHour = (new Date(readings[3].time).getTime() - prediction.t0) / (1000 * 60 * 60);
    const fittedAtLast = prediction.m0 * Math.exp(-prediction.k * lastHour);
    expect(fittedAtLast).toBeGreaterThan(6);
    expect(fittedAtLast).toBeLessThan(9);
  });
});
