/**
 * Chill Portion Calculator engine — port of PUFworks-chill_calculator `app.js`
 * (`chill_calc.py` / Erez & Fishman Dynamic Model).
 *
 * Daily Tmax/Tmin → synthetic hourly curve → Dynamic Model portions.
 * Model constants come from `plugins/chill_portions/engine.json`.
 */
import { chillModelConstants } from '../farm/chillPortionsPackage';

export type DailyTempRow = {
  day: Date;
  tmax: number;
  tmin: number;
};

export type HourlyCalcRow = {
  day: Date;
  doy: number;
  tmax: number;
  tmin: number;
  hour: number;
  temp: number;
  portionInc?: number;
  portionCum?: number;
};

export type DailyChillSummary = {
  date: string;
  cum: number;
  inc: number;
  meanT: number;
};

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((local.getTime() - start.getTime()) / 86400000);
}

function solarDeclination(doy: number): number {
  const g = ((2 * Math.PI) / 365) * (doy - 1);
  return (
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g)
  );
}

export function dayLengthHours(latDeg: number, doy: number): number {
  const lat = (latDeg * Math.PI) / 180;
  const d = solarDeclination(doy);
  let cosHa = -Math.tan(lat) * Math.tan(d);
  cosHa = Math.max(-1, Math.min(1, cosHa));
  return ((180 / Math.PI) * Math.acos(cosHa) * 2) / 15;
}

export function hourlyTempsForDay(
  day: Date,
  tmax: number,
  tmin: number,
  latDeg: number
): HourlyCalcRow[] {
  if (tmax < tmin) {
    throw new Error(`Tmax < Tmin on ${day.toISOString().slice(0, 10)}`);
  }
  const doy = dayOfYear(day);
  let dl = dayLengthHours(latDeg, doy);
  dl = Math.max(0.5, Math.min(23.5, dl));
  const tset = tmin + (tmax - tmin) * Math.sin((Math.PI * dl) / (dl + 4));
  const dl2 = Math.floor(dl);
  const rows: HourlyCalcRow[] = [];

  for (let i = 1; i <= dl2; i++) {
    const t = tmin + (tmax - tmin) * Math.sin((Math.PI * i) / (dl + 4));
    rows.push({ day, doy, tmax, tmin, hour: i, temp: t });
  }
  const dl3 = 24 - dl2;
  for (let j = 1; j <= dl3; j++) {
    const k = j + dl2;
    const t = tset - (Math.log(j) * (tset - tmin)) / Math.log(24 - dl);
    rows.push({ day, doy, tmax, tmin, hour: k, temp: t });
  }
  return rows;
}

export function generateHourly(daily: DailyTempRow[], latDeg: number): HourlyCalcRow[] {
  const out: HourlyCalcRow[] = [];
  for (const obs of daily) {
    out.push(...hourlyTempsForDay(obs.day, obs.tmax, obs.tmin, latDeg));
  }
  return out;
}

export function dynamicChillPortions(tempsC: number[]): {
  increments: number[];
  cumulative: number[];
} {
  const { e0, e1, a0, a1, slp, tetmlt, kelvinOffset } = chillModelConstants;
  const aa = a0 / a1;
  const ee = e1 - e0;
  const increments: number[] = [];
  const cumulative: number[] = [];
  let cum = 0;
  let interE = 0;
  let prevXi = 0;

  for (let i = 0; i < tempsC.length; i++) {
    const tk = tempsC[i]! + kelvinOffset;
    const ftmprt = (slp * tetmlt * (tk - tetmlt)) / tk;
    let sr = Math.exp(ftmprt);
    if (!Number.isFinite(sr)) sr = Infinity;
    const xi = !Number.isFinite(sr) ? 1.0 : sr / (1.0 + sr);
    const xs = aa * Math.exp(ee / tk);
    const ak1 = a1 * Math.exp(-e1 / tk);

    const interS = i === 0 ? 0 : interE < 1 ? interE : interE - interE * prevXi;
    interE = xs - (xs - interS) * Math.exp(-ak1);
    const delt = interE < 1 ? 0 : interE * xi;
    cum += delt;
    prevXi = xi;
    increments.push(delt);
    cumulative.push(cum);
  }
  return { increments, cumulative };
}

export function applyDynamicModel(rows: HourlyCalcRow[]): number {
  if (!rows.length) return 0;
  const { increments, cumulative } = dynamicChillPortions(rows.map((r) => r.temp));
  for (let i = 0; i < rows.length; i++) {
    rows[i]!.portionInc = increments[i];
    rows[i]!.portionCum = cumulative[i];
  }
  return cumulative[cumulative.length - 1] ?? 0;
}

export function dailySummary(rows: HourlyCalcRow[]): DailyChillSummary[] {
  if (!rows.length) return [];
  const byDay = new Map<string, HourlyCalcRow[]>();
  for (const r of rows) {
    const key = isoDate(r.day);
    const list = byDay.get(key);
    if (list) list.push(r);
    else byDay.set(key, [r]);
  }
  const keys = [...byDay.keys()].sort();
  const out: DailyChillSummary[] = [];
  let prevCum = 0;
  for (const k of keys) {
    const hrs = byDay.get(k)!;
    const endCum = hrs[hrs.length - 1]!.portionCum ?? 0;
    const dayInc = endCum - prevCum;
    const meanT = hrs.reduce((s, h) => s + h.temp, 0) / hrs.length;
    out.push({ date: k, cum: endCum, inc: dayInc, meanT });
    prevCum = endCum;
  }
  return out;
}

export function parseDate(raw: string): Date {
  let s = String(raw).trim().replace(/^["']|["']$/g, '');
  if (!s) throw new Error('empty date');
  if (s.includes('T')) s = s.split('T')[0]!;
  if (/\s/.test(s) && /^\d/.test(s)) s = s.split(/\s+/)[0]!;

  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return new Date(+ymd[1]!, +ymd[2]! - 1, +ymd[3]!);

  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) {
    const a = +dmy[1]!;
    const b = +dmy[2]!;
    const y = +dmy[3]!;
    if (a > 12) return new Date(y, b - 1, a);
    if (b > 12) return new Date(y, a - 1, b);
    return new Date(y, b - 1, a);
  }

  const dmy2 = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})$/);
  if (dmy2) {
    const a = +dmy2[1]!;
    const b = +dmy2[2]!;
    let y = +dmy2[3]!;
    y += y < 70 ? 2000 : 1900;
    if (a > 12) return new Date(y, b - 1, a);
    return new Date(y, b - 1, a);
  }

  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return new Date(+compact[1]!, +compact[2]! - 1, +compact[3]!);

  const serial = parseFloat(s);
  if (!Number.isNaN(serial) && serial > 20000) {
    const ms = Date.UTC(1899, 11, 30) + serial * 86400000;
    const d = new Date(ms);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  throw new Error(`Unrecognised date: ${s}`);
}

function parseTemp(raw: string): number {
  let s = String(raw).trim().replace(/^["']|["']$/g, '');
  if (!s || /^(na|n\/a|null|-|--|nan)$/i.test(s)) throw new Error('missing temperature');
  s = s.replace(/[°º]/g, '').replace(/[Cc]/g, '').trim().replace(',', '.');
  const v = parseFloat(s);
  if (Number.isNaN(v)) throw new Error(`bad temp: ${s}`);
  return v;
}

function normalizeHeader(h: string): string {
  return String(h)
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[°º()[\]{}]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectDailyColumns(headers: string[]): { iDate: number; iMax: number; iMin: number } | null {
  const norms = headers.map(normalizeHeader);
  const scoreDate = (h: string) => {
    if (['date', 'day', 'datum', 'datetime', 'time', 'timestamp'].includes(h)) return 10;
    if (h.includes('date') || h.endsWith(' day') || h.startsWith('day ')) return 8;
    return 0;
  };
  const scoreMax = (h: string) => {
    if (
      ['tmax', 't max', 'max', 'maximum', 'temp max', 'max temp', 'maximum temperature', 'max temperature', 'tx'].includes(
        h
      )
    ) {
      return 10;
    }
    if (h.includes('max') && h.includes('temp')) return 9;
    if (h.startsWith('max') && !h.includes('min')) return 6;
    if (h.includes('maximum')) return 6;
    return 0;
  };
  const scoreMin = (h: string) => {
    if (
      ['tmin', 't min', 'min', 'minimum', 'temp min', 'min temp', 'minimum temperature', 'min temperature', 'tn'].includes(
        h
      )
    ) {
      return 10;
    }
    if (h.includes('min') && h.includes('temp')) return 9;
    if (h.startsWith('min') && !h.includes('max')) return 6;
    if (h.includes('minimum')) return 6;
    return 0;
  };

  let iDate = 0;
  let iMax = 0;
  let iMin = 0;
  let bestD = -1;
  let bestX = -1;
  let bestN = -1;
  for (let i = 0; i < norms.length; i++) {
    const d = scoreDate(norms[i]!);
    const x = scoreMax(norms[i]!);
    const n = scoreMin(norms[i]!);
    if (d > bestD) {
      bestD = d;
      iDate = i;
    }
    if (x > bestX) {
      bestX = x;
      iMax = i;
    }
    if (n > bestN) {
      bestN = n;
      iMin = i;
    }
  }
  if (bestD <= 0 || bestX <= 0 || bestN <= 0) return null;
  if (new Set([iDate, iMax, iMin]).size < 3) return null;
  return { iDate, iMax, iMin };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      q = !q;
      continue;
    }
    if (ch === ',' && !q) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function splitLooseLine(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  if (trimmed.includes('\t')) return trimmed.split('\t').map((c) => c.trim());
  if (trimmed.includes(';')) return trimmed.split(';').map((c) => c.trim());
  if (trimmed.includes(',')) return parseCsvLine(trimmed);
  return trimmed.split(/\s+/);
}

function looksLikeHeader(cols: string[]): boolean {
  const joined = cols.map(normalizeHeader).join(' ');
  return ['date', 'max', 'min', 'temp', 'tmax', 'tmin', 'day'].some((k) => joined.includes(k));
}

function rowIsData(cols: string[]): boolean {
  if (!cols.length) return false;
  try {
    parseDate(cols[0]!);
    return true;
  } catch {
    /* continue */
  }
  let numeric = 0;
  for (const c of cols.slice(1, 4)) {
    try {
      parseTemp(c);
      numeric += 1;
    } catch {
      /* skip */
    }
  }
  return numeric >= 2;
}

export function parseDailyText(text: string): DailyTempRow[] {
  const cleaned = String(text).replace(/^\uFEFF/, '').trim();
  if (!cleaned) return [];

  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim());
  const raw = lines.map(splitLooseLine).filter((r) => r.length && r.some((c) => c.trim()));
  if (!raw.length) return [];

  const hasHeader = looksLikeHeader(raw[0]!) && !rowIsData(raw[0]!);
  let iDate = 0;
  let iMax = 1;
  let iMin = 2;
  let data = raw;

  if (hasHeader) {
    const det = detectDailyColumns(raw[0]!);
    if (!det) {
      throw new Error(
        'Could not find Date / Max temp / Min temp columns.\nHeaders: ' + raw[0]!.join(', ')
      );
    }
    ({ iDate, iMax, iMin } = det);
    data = raw.slice(1);
  }

  const rows: DailyTempRow[] = [];
  const errors: string[] = [];
  data.forEach((cols, idx) => {
    if (!cols || !cols.some((c) => String(c).trim())) return;
    if (looksLikeHeader(cols) && !rowIsData(cols)) return;
    try {
      const need = Math.max(iDate, iMax, iMin);
      if (cols.length <= need) throw new Error(`need ${need + 1} columns`);
      let tmax = parseTemp(cols[iMax]!);
      let tmin = parseTemp(cols[iMin]!);
      if (tmax < tmin) [tmax, tmin] = [tmin, tmax];
      rows.push({ day: parseDate(cols[iDate]!), tmax, tmin });
    } catch (e) {
      errors.push(`line ${idx + (hasHeader ? 2 : 1)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  if (!rows.length) {
    throw new Error('No valid daily weather rows found.\n' + errors.slice(0, 8).join('\n'));
  }
  rows.sort((a, b) => a.day.getTime() - b.day.getTime());
  return rows;
}

export function calculateDailyChill(text: string, latDeg: number): {
  totalPortions: number;
  days: DailyChillSummary[];
  hours: number;
} {
  const daily = parseDailyText(text);
  const hourly = generateHourly(daily, latDeg);
  const total = applyDynamicModel(hourly);
  return {
    totalPortions: Math.round(total * 100) / 100,
    days: dailySummary(hourly),
    hours: hourly.length,
  };
}
