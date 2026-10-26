import { roundTonnes, type FieldBinMovement } from './fieldBinStock';

export type FieldBinDaySummary = {
  day: string;
  inT: number;
  outT: number;
  loads: number;
};

export type FieldBinPaddockSummary = {
  paddockId: string | null;
  inT: number;
  outT: number;
  holdingT: number;
  binIds: string[];
};

export type FieldBinHistoryLoad = {
  movement: FieldBinMovement;
  /** Other bins on the same load, outside the selection. */
  alsoBinIds: string[];
};

/** Loads that touched these bins, with only those bins' tonnes kept on each load. */
export function loadsForBins(movements: FieldBinMovement[], binIds: ReadonlySet<string>): FieldBinHistoryLoad[] {
  const loads: FieldBinHistoryLoad[] = [];
  for (const movement of movements) {
    const lines = movement.lines.filter((line) => binIds.has(line.binId));
    if (lines.length === 0) continue;
    loads.push({
      movement: { ...movement, lines },
      alsoBinIds: [...new Set(movement.lines.filter((line) => !binIds.has(line.binId)).map((line) => line.binId))],
    });
  }
  return loads.sort((a, b) => b.movement.at.localeCompare(a.movement.at) || b.movement.id.localeCompare(a.movement.id));
}

/** Calendar day of a movement. `en-CA` formats as YYYY-MM-DD. */
export function fieldBinDayKey(at: string, timeZone = 'UTC'): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Daily and paddock totals from the same movements. A bin's paddock is wherever
 * the pin sits now. Days are newest first.
 */
export function summarizeFieldBinHistory(input: {
  movements: FieldBinMovement[];
  stock: Record<string, { tonnes: number }>;
  binPaddock: Record<string, string | null>;
  timeZone?: string;
}): { days: FieldBinDaySummary[]; paddocks: FieldBinPaddockSummary[] } {
  const timeZone = input.timeZone ?? 'UTC';
  const days = new Map<string, FieldBinDaySummary>();
  const paddocks = new Map<string, FieldBinPaddockSummary>();

  const paddockKey = (binId: string) => input.binPaddock[binId] ?? null;
  const group = (paddockId: string | null) => {
    const key = paddockId ?? '';
    const existing = paddocks.get(key);
    if (existing) return existing;
    const next: FieldBinPaddockSummary = { paddockId, inT: 0, outT: 0, holdingT: 0, binIds: [] };
    paddocks.set(key, next);
    return next;
  };

  const binIds = new Set<string>([
    ...Object.keys(input.binPaddock),
    ...Object.keys(input.stock),
    ...input.movements.flatMap((movement) => movement.lines.map((line) => line.binId)),
  ]);
  for (const binId of binIds) {
    const row = group(paddockKey(binId));
    if (!row.binIds.includes(binId)) row.binIds.push(binId);
    row.holdingT = roundTonnes(row.holdingT + (input.stock[binId]?.tonnes ?? 0));
  }

  const ordered = [...input.movements].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
  for (const movement of ordered) {
    const day = fieldBinDayKey(movement.at, timeZone);
    if (!day) continue;
    const summary = days.get(day) ?? { day, inT: 0, outT: 0, loads: 0 };
    summary.loads += 1;
    if (movement.setLevel || movement.setMoisture) {
      days.set(day, summary);
      continue;
    }
    for (const line of movement.lines) {
      if (movement.direction === 'in') summary.inT = roundTonnes(summary.inT + line.tonnes);
      else summary.outT = roundTonnes(summary.outT + line.tonnes);
      const row = group(paddockKey(line.binId));
      if (movement.direction === 'in') row.inT = roundTonnes(row.inT + line.tonnes);
      else row.outT = roundTonnes(row.outT + line.tonnes);
    }
    days.set(day, summary);
  }

  return {
    days: [...days.values()],
    paddocks: [...paddocks.values()].sort((a, b) => (a.paddockId ?? '￿').localeCompare(b.paddockId ?? '￿')),
  };
}
