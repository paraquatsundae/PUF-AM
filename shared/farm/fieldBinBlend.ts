/**
 * A recommended truck blend. Plans/FIELD_BINS_PLUGIN.md.
 * Trailer 1 is filled first from the first bin, by that bin's share of the grain
 * on hand. The next bin finishes the trailer or, when it is full, starts the next.
 */
import { roundTonnes, truckCapacityT, type FieldBinTrailer, type TruckFill } from './fieldBinStock';

/** planTruckLoad refuses more than 12 lines. A continuous pour uses bins + trailers − 1. */
const MAX_LINES = 12;

export type BlendBin = {
  id: string;
  tonnes: number;
  moisture: number | null;
};

export type TruckBlendResult =
  | { ok: true; fills: TruckFill[]; skippedIds: string[] }
  | { ok: false; error: string };

function wholePercents(weights: number[], target: number): number[] {
  const raw = weights.map((weight) => weight * target);
  const floors = raw.map((value) => Math.floor(value));
  let left = target - floors.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  const out = [...floors];
  for (const row of order) {
    if (left <= 0) break;
    out[row.index] += 1;
    left -= 1;
  }
  return out;
}

function drawnTonnes(fills: TruckFill[], trailers: FieldBinTrailer[]): Map<string, number> {
  const caps = new Map(trailers.map((trailer) => [trailer.id, trailer.capacityT]));
  const drawn = new Map<string, number>();
  for (const fill of fills) {
    const tonnes = roundTonnes((fill.percent / 100) * (caps.get(fill.trailerId) ?? 0));
    drawn.set(fill.binId, roundTonnes((drawn.get(fill.binId) ?? 0) + tonnes));
  }
  return drawn;
}

type Pour = { trailerId: string; binId: string; tonnes: number };

/** Pour each bin's share into trailer 1, then trailer 2, and so on. */
function pourShares(trailers: FieldBinTrailer[], shares: { id: string; tonnes: number }[]): Pour[] {
  const left = new Map(shares.map((bin) => [bin.id, bin.tonnes]));
  const pours: Pour[] = [];
  for (const trailer of trailers) {
    let space = trailer.capacityT;
    for (const bin of shares) {
      if (space <= 1e-6) break;
      const have = left.get(bin.id) ?? 0;
      if (have <= 1e-6) continue;
      const take = Math.min(space, have);
      pours.push({ trailerId: trailer.id, binId: bin.id, tonnes: take });
      space = roundTonnes(space - take);
      left.set(bin.id, roundTonnes(have - take));
    }
  }
  return pours;
}

function percentsForTrailer(pours: Pour[], capacity: number): number[] {
  const sum = pours.reduce((total, pour) => total + pour.tonnes, 0);
  if (sum <= 0 || capacity <= 0) return pours.map(() => 0);
  const target = sum + 1e-6 >= capacity ? 100 : Math.floor((sum / capacity) * 100 + 1e-9);
  if (target <= 0) return pours.map(() => 0);
  return wholePercents(
    pours.map((pour) => pour.tonnes / sum),
    target
  );
}

/** Whole-number percents of each trailer, loaded bin by bin. Bins with no moisture are skipped. */
export function recommendTruckBlend(input: { trailers: FieldBinTrailer[]; bins: BlendBin[] }): TruckBlendResult {
  const trailers = input.trailers.filter((trailer) => trailer.id && trailer.capacityT > 0);
  if (trailers.length === 0) return { ok: false, error: 'Add at least one trailer.' };
  const skippedIds = input.bins.filter((bin) => bin.tonnes > 0 && bin.moisture == null).map((bin) => bin.id);
  const available = input.bins.filter((bin) => bin.id && bin.tonnes > 0 && bin.moisture != null);
  if (available.length === 0) {
    return {
      ok: false,
      error: skippedIds.length
        ? 'Set a moisture on a bin that has grain before blending.'
        : 'No bin has grain to load.',
    };
  }
  const room = Math.max(1, MAX_LINES - trailers.length + 1);
  const kept = available.slice(0, room);
  const stock = kept.reduce((sum, bin) => sum + bin.tonnes, 0);
  const truckCap = truckCapacityT(trailers);
  if (truckCap <= 0 || stock <= 0) return { ok: false, error: 'No bin has grain to load.' };
  const draw = Math.min(truckCap, stock);
  if (draw / truckCap < 0.01) return { ok: false, error: 'The bins do not hold enough grain to load.' };
  const shares = kept.map((bin) => ({ id: bin.id, tonnes: roundTonnes(draw * (bin.tonnes / stock)) }));
  const pours = pourShares(trailers, shares);
  let fills: TruckFill[] = [];
  for (const trailer of trailers) {
    const rows = pours.filter((pour) => pour.trailerId === trailer.id);
    const percents = percentsForTrailer(rows, trailer.capacityT);
    rows.forEach((pour, index) => {
      const percent = percents[index] ?? 0;
      if (percent <= 0) return;
      if (roundTonnes((percent / 100) * trailer.capacityT) <= 0) return;
      fills.push({ trailerId: trailer.id, binId: pour.binId, percent });
    });
  }
  const cap = new Map(kept.map((bin) => [bin.id, bin.tonnes]));
  for (let guard = 0; guard < 400; guard += 1) {
    const overId = [...drawnTonnes(fills, trailers).entries()].find(
      ([id, tonnes]) => tonnes > (cap.get(id) ?? 0) + 1e-6
    )?.[0];
    if (!overId) break;
    const index = fills.findIndex((fill) => fill.binId === overId && fill.percent > 0);
    if (index < 0) break;
    const row = fills[index];
    if (!row) break;
    fills[index] = { ...row, percent: row.percent - 1 };
  }
  fills = fills.filter((fill) => fill.percent > 0);
  if (fills.length === 0) return { ok: false, error: 'The bins do not hold enough grain to load.' };
  return { ok: true, fills, skippedIds };
}
