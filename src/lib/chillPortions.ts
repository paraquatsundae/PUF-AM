/** Dynamic chill portions (Utah-style intermediate model) + cultivar targets. */

export const CULTIVARS = [
  { id: 'chandler', name: 'Chandler', requiredCP: 45 },
  { id: 'howard', name: 'Howard', requiredCP: 45 },
  { id: 'tulare', name: 'Tulare', requiredCP: 42 },
  { id: 'vina', name: 'Vina', requiredCP: 38 },
  { id: 'franquette', name: 'Franquette', requiredCP: 55 },
] as const;

export type CultivarId = (typeof CULTIVARS)[number]['id'];

export function resolveCultivarTarget(cultivarName?: string): { id: string; name: string; requiredCP: number } {
  if (!cultivarName?.trim()) return CULTIVARS[0];
  const key = cultivarName.trim().toLowerCase();
  const match = CULTIVARS.find((c) => c.id === key || c.name.toLowerCase() === key);
  return match || { id: key, name: cultivarName.trim(), requiredCP: CULTIVARS[0].requiredCP };
}

export function calculateChillData(hourlyTemps: number[], timeArray: string[]) {
  const e0 = 4153.5;
  const e1 = 12888.8;
  const a0 = 139500.0;
  const a1 = 2.567e18;
  const slp = 1.6;
  const tetmlt = 277.0;
  const aa = a0 / a1;
  const ee = e1 - e0;

  let x = 0.0;
  let portions = 0.0;

  const monthlyData: Record<string, number> = {
    Mar: 0,
    Apr: 0,
    May: 0,
    Jun: 0,
    Jul: 0,
    Aug: 0,
    Sep: 0,
  };

  for (let i = 0; i < hourlyTemps.length; i++) {
    const t = hourlyTemps[i];
    if (t === null || t === undefined) continue;

    const dateStr = timeArray[i];
    const date = new Date(dateStr);
    const month = date.toLocaleString('en-US', { month: 'short' });

    const tk = t + 273.15;
    const ftmprt = (slp * tetmlt * (tk - tetmlt)) / tk;
    const sr = Math.exp(ftmprt);
    const xi = sr / (1.0 + sr);
    const xs = aa * Math.exp(ee / tk);
    const ak1 = a1 * Math.exp(-e1 / tk);
    const interE = Math.exp(-ak1);

    x = xs - (xs - x) * interE;

    if (x >= 1.0) {
      x = x * (1.0 - xi);
      portions += xi;
      if (monthlyData[month] !== undefined) {
        monthlyData[month] += xi;
      }
    }
  }

  const chartData = Object.keys(monthlyData).map((month) => ({
    month,
    portions: Math.round(monthlyData[month]! * 10) / 10,
  }));

  return { totalPortions: Math.round(portions), chartData };
}

/** Placeholder until hourly weather is wired for chill (matches prior Dashboard stub). */
export const PLACEHOLDER_FARM_CHILL_PORTIONS = 45;
