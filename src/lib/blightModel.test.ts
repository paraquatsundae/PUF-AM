import { describe, it, expect } from "vitest";
import { runBlightModel, type WeatherData } from "./blightModel";

function buildFavorableWeather(start: string, days: number): Record<string, WeatherData> {
  const weather: Record<string, WeatherData> = {};
  const startDate = new Date(start);
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    weather[key] = {
      T: 18,
      RH: 92,
      R: 2,
      WD: 12,
      maxHourlyRain: 1.5,
      windSpeed: 8,
      ET0: 3,
    };
  }
  return weather;
}

describe("runBlightModel", () => {
  it("returns one row per day in the date range", () => {
    const results = runBlightModel(
      new Date("2026-03-01"),
      new Date("2026-03-07"),
      "bloom",
      {},
      buildFavorableWeather("2026-03-01", 7)
    );

    expect(results).toHaveLength(7);
    expect(results[0].fullDate).toBe("2026-03-01");
    expect(results[results.length - 1].fullDate).toBe("2026-03-07");
  });

  it("increases threat under favorable bloom conditions", () => {
    const results = runBlightModel(
      new Date("2026-03-01"),
      new Date("2026-03-14"),
      "bloom",
      {},
      buildFavorableWeather("2026-03-01", 14),
      {},
      "micro",
      undefined,
      { phenologyMode: "fixed" }
    );

    const firstThreat = results[0].threat;
    const lastThreat = results[results.length - 1].threat;
    expect(lastThreat).toBeGreaterThan(firstThreat);
    expect(lastThreat).toBeGreaterThan(0.1);
    expect(lastThreat).toBeLessThanOrEqual(1.5);
  });

  it("ignores sprays on the default forecast path", () => {
    const sprayEvents = {
      "2026-03-05": { type: "chem" as const, method: "helicopter" as const },
    };

    const results = runBlightModel(
      new Date("2026-03-01"),
      new Date("2026-03-07"),
      "bloom",
      sprayEvents,
      buildFavorableWeather("2026-03-01", 7)
    );

    const sprayDay = results.find((r) => r.fullDate === "2026-03-05");
    expect(sprayDay?.isSprayDay).toBe(false);
    expect(sprayDay?.chem).toBe(0);
    expect(sprayDay?.bio).toBe(0);
  });

  it("records chemical protection on spray days only when includeProtection is on", () => {
    const sprayEvents = {
      "2026-03-05": { type: "chem" as const, method: "helicopter" as const },
    };

    const results = runBlightModel(
      new Date("2026-03-01"),
      new Date("2026-03-07"),
      "bloom",
      sprayEvents,
      buildFavorableWeather("2026-03-01", 7),
      {},
      "micro",
      undefined,
      { includeProtection: true, phenologyMode: "fixed" }
    );

    const sprayDay = results.find((r) => r.fullDate === "2026-03-05");
    expect(sprayDay?.isSprayDay).toBe(true);
    expect(sprayDay?.chem).toBeGreaterThan(0);
  });

  it("does not decay same-day spray below application strength", () => {
    const sprayEvents = {
      "2026-03-05": { type: "chem" as const, method: "helicopter" as const },
    };

    const results = runBlightModel(
      new Date("2026-03-01"),
      new Date("2026-03-07"),
      "bloom",
      sprayEvents,
      buildFavorableWeather("2026-03-01", 7),
      {},
      "micro",
      undefined,
      { includeProtection: true, phenologyMode: "fixed" }
    );

    const sprayDay = results.find((r) => r.fullDate === "2026-03-05");
    expect(sprayDay?.chem).toBeGreaterThanOrEqual(0.9);
  });

  it("produces lower threat in dormant stage than bloom under same weather", () => {
    const weather = buildFavorableWeather("2026-03-01", 7);
    const fixed = { phenologyMode: "fixed" as const };
    const dormant = runBlightModel(
      new Date("2026-03-01"),
      new Date("2026-03-07"),
      "dormant",
      {},
      weather,
      {},
      "micro",
      undefined,
      fixed
    );
    const bloom = runBlightModel(
      new Date("2026-03-01"),
      new Date("2026-03-07"),
      "bloom",
      {},
      weather,
      {},
      "micro",
      undefined,
      fixed
    );

    const dormantLast = dormant[dormant.length - 1].threat;
    const bloomLast = bloom[bloom.length - 1].threat;
    expect(bloomLast).toBeGreaterThan(dormantLast);
    expect(dormantLast).toBeGreaterThanOrEqual(0);
    expect(dormantLast).toBeLessThanOrEqual(1.5);
  });

  it("erupts latent infections after GDD latency threshold", () => {
    // T=18 → ~8 GDD/day; threshold 120 → eruptions after ~15 days
    const results = runBlightModel(
      new Date("2026-03-01"),
      new Date("2026-03-25"),
      "bloom",
      {},
      buildFavorableWeather("2026-03-01", 25),
      {},
      "micro",
      undefined,
      { phenologyMode: "fixed" }
    );

    const withEruption = results.find((r) => r.eruptingThreat > 0);
    expect(withEruption).toBeDefined();
    expect(withEruption!.fullDate >= "2026-03-15").toBe(true);
  });

  it("uses calendar phenology so October bloom is not stuck on July dormant", () => {
    const weather = buildFavorableWeather("2025-07-01", 130);
    const results = runBlightModel(
      new Date("2025-07-01"),
      new Date("2025-11-07"),
      "dormant",
      {},
      weather,
      {},
      "micro",
      undefined,
      { phenologyMode: "calendar" }
    );

    const july = results.find((r) => r.fullDate === "2025-07-15");
    const october = results.filter((r) => r.fullDate >= "2025-10-01" && r.fullDate <= "2025-10-31");
    const maxOctThreat = Math.max(...october.map((r) => r.threat));
    const maxOctLatent = Math.max(...october.map((r) => r.latentThreat));

    expect(july?.threat ?? 0).toBeLessThan(0.2);
    expect(maxOctThreat).toBeGreaterThan(0.15);
    expect(maxOctLatent).toBeGreaterThan(0);
  });

  it("still produces spring signal in a later season without inoculum gating", () => {
    const start = new Date("2023-06-01");
    const end = new Date("2024-11-01");
    const days =
      Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const weather = buildFavorableWeather("2023-06-01", days);

    const results = runBlightModel(
      start,
      end,
      "dormant",
      {},
      weather,
      {},
      "micro",
      undefined,
      { phenologyMode: "calendar" }
    );

    const season2Bloom = results.filter(
      (r) => r.fullDate >= "2024-10-01" && r.fullDate <= "2024-10-31"
    );
    const maxThreat = Math.max(...season2Bloom.map((r) => r.threat));
    const maxLatent = Math.max(...season2Bloom.map((r) => r.latentThreat));
    expect(maxThreat).toBeGreaterThan(0.15);
    expect(maxLatent).toBeGreaterThan(0);
  });
});
