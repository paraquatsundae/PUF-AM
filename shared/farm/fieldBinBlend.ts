/**
 * A recommended truck blend. Plans/FIELD_BINS_PLUGIN.md.
 * The load aims up to a delivery moisture. Grain drier than that fills the truck
 * first, bin by bin, and wetter grain is added only until the mix reaches the
 * target. A trailer that would sit over the trailer limit takes just enough
 * drier grain to come back to that limit. The same split is not copied onto
 * every trailer.
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

type Lot = { id: string; tonnes: number; moisture: number };
type Pour = { trailerId: string; binId: string; tonnes: number };

/** Fractions a loader can judge by eye. 33 and 67 stand for 1/3 and 2/3. */
const EYE_PERCENTS = [25, 33, 50, 67, 75, 100];

const EYE_LABELS: Record<number, string> = {
  25: '1/4',
  33: '1/3',
  50: '1/2',
  67: '2/3',
  75: '3/4',
  100: '4/4',
};

/** `1/4` for an eye fraction. Anything else is judged on the scales, not as a percent. */
export function eyeFractionLabel(percent: number): string | null {
  return EYE_LABELS[percent] ?? null;
}

function sliceTonnes(bins: Lot[], want: number): Lot[] {
  const parts: Lot[] = [];
  let left = want;
  for (const bin of bins) {
    if (left <= 1e-9) break;
    const take = Math.min(bin.tonnes, left);
    if (take > 1e-6) parts.push({ id: bin.id, tonnes: take, moisture: bin.moisture });
    left -= take;
  }
  return parts;
}

function mixOf(parts: Lot[]): number {
  const tonnes = parts.reduce((sum, part) => sum + part.tonnes, 0);
  if (tonnes <= 0) return 0;
  return parts.reduce((sum, part) => sum + part.tonnes * part.moisture, 0) / tonnes;
}

/** Most wet tonnes that still keep the mix at or under the delivery moisture. */
function allocateShares(bins: Lot[], need: number, deliverAt: number): { id: string; tonnes: number }[] {
  const dry = bins.filter((bin) => bin.moisture <= deliverAt + 1e-9);
  const hot = bins.filter((bin) => bin.moisture > deliverAt + 1e-9);
  const dryStock = dry.reduce((sum, bin) => sum + bin.tonnes, 0);
  const hotStock = hot.reduce((sum, bin) => sum + bin.tonnes, 0);
  const truckNeed = Math.min(need, dryStock + hotStock);
  let lo = 0;
  let hi = Math.min(hotStock, truckNeed);
  let bestH = 0;
  for (let step = 0; step < 48; step += 1) {
    const hotTonnes = (lo + hi) / 2;
    const dryTonnes = Math.min(dryStock, truckNeed - hotTonnes);
    const parts = [...sliceTonnes(dry, dryTonnes), ...sliceTonnes(hot, hotTonnes)];
    if (parts.length > 0 && mixOf(parts) <= deliverAt + 1e-6) {
      bestH = hotTonnes;
      lo = hotTonnes;
    } else {
      hi = hotTonnes;
    }
  }
  const dryTonnes = Math.min(dryStock, truckNeed - bestH);
  const taken = new Map<string, number>();
  for (const part of [...sliceTonnes(dry, dryTonnes), ...sliceTonnes(hot, bestH)]) {
    taken.set(part.id, (taken.get(part.id) ?? 0) + part.tonnes);
  }
  return bins
    .filter((bin) => (taken.get(bin.id) ?? 0) > 1e-4)
    .map((bin) => ({ id: bin.id, tonnes: roundTonnes(taken.get(bin.id) ?? 0) }))
    .filter((bin) => bin.tonnes > 0);
}

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

function pourStats(pours: Pour[], trailerId: string, moist: Map<string, number>): { tonnes: number; moisture: number } | null {
  let tonnes = 0;
  let sum = 0;
  for (const pour of pours) {
    if (pour.trailerId !== trailerId) continue;
    const moisture = moist.get(pour.binId);
    if (moisture == null) continue;
    tonnes += pour.tonnes;
    sum += pour.tonnes * moisture;
  }
  if (tonnes <= 1e-9) return null;
  return { tonnes, moisture: sum / tonnes };
}

function addTonnes(rows: Pour[], trailerId: string, binId: string, delta: number): void {
  const found = rows.find((row) => row.trailerId === trailerId && row.binId === binId);
  if (found) found.tonnes = roundTonnes(found.tonnes + delta);
  else rows.push({ trailerId, binId, tonnes: roundTonnes(delta) });
}

/** Move the least drier grain that brings an over-limit trailer back to the cap. */
function fitTrailerCap(pours: Pour[], trailers: FieldBinTrailer[], moist: Map<string, number>, trailerMax: number): Pour[] | null {
  const order = trailers.map((trailer) => trailer.id);
  const rows = pours.map((pour) => ({ ...pour }));
  for (let guard = 0; guard < 40; guard += 1) {
    let worst: { id: string; moisture: number; tonnes: number } | null = null;
    for (const id of order) {
      const stats = pourStats(rows, id, moist);
      if (!stats || stats.moisture <= trailerMax + 1e-4) continue;
      if (!worst || stats.moisture > worst.moisture) worst = { id, ...stats };
    }
    if (!worst) return rows.filter((row) => row.tonnes > 1e-4);
    const hot = rows
      .filter((row) => row.trailerId === worst.id)
      .reduce((best, row) => ((moist.get(row.binId) ?? 0) > (moist.get(best.binId) ?? 0) ? row : best));
    const hotMoisture = moist.get(hot.binId) ?? 0;
    let donor: Pour | null = null;
    let donorRoom = 0;
    for (const row of rows) {
      if (row.trailerId === worst.id) continue;
      const donorMoisture = moist.get(row.binId) ?? 0;
      if (donorMoisture >= hotMoisture - 1e-9) continue;
      const stats = pourStats(rows, row.trailerId, moist);
      if (!stats) continue;
      const room = ((trailerMax - stats.moisture) * stats.tonnes) / (hotMoisture - donorMoisture);
      const later = donor != null && order.indexOf(row.trailerId) > order.indexOf(donor.trailerId);
      if (room > 1e-4 && (donor == null || later)) {
        donor = row;
        donorRoom = room;
      }
    }
    if (!donor) return null;
    const donorMoisture = moist.get(donor.binId) ?? 0;
    const need = ((worst.moisture - trailerMax) * worst.tonnes) / (hotMoisture - donorMoisture);
    const moved = Math.min(need, donorRoom, hot.tonnes, donor.tonnes);
    if (moved <= 1e-4) return null;
    addTonnes(rows, hot.trailerId, hot.binId, -moved);
    addTonnes(rows, donor.trailerId, donor.binId, -moved);
    addTonnes(rows, hot.trailerId, donor.binId, moved);
    addTonnes(rows, donor.trailerId, hot.binId, moved);
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      if ((rows[index]?.tonnes ?? 0) <= 1e-4) rows.splice(index, 1);
    }
  }
  return null;
}

function nearestEye(ideal: number): number {
  let best = 0;
  let bestDist = Math.abs(ideal);
  for (const step of EYE_PERCENTS) {
    const dist = Math.abs(step - ideal);
    if (dist < bestDist) {
      best = step;
      bestDist = dist;
    }
  }
  return best;
}

function eyeOptions(count: number, target: number): number[][] {
  const steps = [0, ...EYE_PERCENTS];
  const out: number[][] = [];
  const walk = (acc: number[]) => {
    const used = acc.reduce((sum, value) => sum + value, 0);
    if (acc.length === count) {
      if (used === target) out.push(acc);
      return;
    }
    for (const step of steps) {
      if (used + step > target) continue;
      walk([...acc, step]);
    }
  };
  walk([]);
  return out;
}

function optionMoisture(percents: number[], pours: Pour[], capacity: number, moist: Map<string, number>): number | null {
  let tonnes = 0;
  let sum = 0;
  for (let index = 0; index < pours.length; index += 1) {
    const pour = pours[index];
    if (!pour) continue;
    const taken = ((percents[index] ?? 0) / 100) * capacity;
    tonnes += taken;
    sum += taken * (moist.get(pour.binId) ?? 0);
  }
  if (tonnes <= 1e-9) return null;
  return sum / tonnes;
}

function optionFits(
  percents: number[],
  pours: Pour[],
  capacity: number,
  stock: Map<string, number>,
  moist: Map<string, number>,
  trailerMax: number
): boolean {
  for (let index = 0; index < pours.length; index += 1) {
    const pour = pours[index];
    if (!pour) continue;
    const taken = ((percents[index] ?? 0) / 100) * capacity;
    if (taken > (stock.get(pour.binId) ?? 0) + 0.05) return false;
  }
  const moisture = optionMoisture(percents, pours, capacity, moist);
  return moisture == null || moisture <= trailerMax + 1e-6;
}

/** Snap a trailer to 1/4, 1/3, 1/2, 2/3, 3/4 or 4/4. A sliver that is not one of those stays a tonne figure. */
function eyePercents(
  pours: Pour[],
  capacity: number,
  moist: Map<string, number>,
  trailerMax: number,
  stock: Map<string, number>
): number[] {
  const ideals = pours.map((pour) => (pour.tonnes / capacity) * 100);
  const idealSum = ideals.reduce((sum, value) => sum + value, 0);
  const full = idealSum + 1e-6 >= 100;
  const target = full ? 100 : nearestEye(idealSum);
  let best: number[] | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const option of eyeOptions(pours.length, target)) {
    if (!optionFits(option, pours, capacity, stock, moist, trailerMax)) continue;
    const dist = option.reduce((sum, value, index) => sum + Math.abs(value - (ideals[index] ?? 0)), 0);
    const empty = option.every((value) => value === 0);
    if (empty && idealSum >= 12.5) continue;
    if (dist < bestDist) {
      best = option;
      bestDist = dist;
    }
  }
  if (best && best.some((value) => value > 0)) return best;
  return pours.map((pour) => {
    let tonnes = Math.round(pour.tonnes * 2) / 2;
    const have = stock.get(pour.binId) ?? 0;
    if (tonnes > have) tonnes = Math.floor(have * 2) / 2;
    if (tonnes < 1 || capacity <= 0) return 0;
    const moisture = moist.get(pour.binId) ?? 0;
    if (moisture > trailerMax + 1e-6) return 0;
    return Math.round((tonnes / capacity) * 100);
  });
}

function fillsFromPours(pours: Pour[], trailers: FieldBinTrailer[], binOrder: string[], moist: Map<string, number>, trailerMax: number, stock: Map<string, number>): TruckFill[] {
  const trailerAt = new Map(trailers.map((trailer, index) => [trailer.id, index]));
  const binAt = new Map(binOrder.map((id, index) => [id, index]));
  const ordered = [...pours].sort(
    (a, b) =>
      (trailerAt.get(a.trailerId) ?? 0) - (trailerAt.get(b.trailerId) ?? 0) ||
      (binAt.get(a.binId) ?? 0) - (binAt.get(b.binId) ?? 0)
  );
  const fills: TruckFill[] = [];
  for (const trailer of trailers) {
    const rows = ordered.filter((pour) => pour.trailerId === trailer.id);
    const percents = eyePercents(rows, trailer.capacityT, moist, trailerMax, stock);
    rows.forEach((pour, index) => {
      const percent = percents[index] ?? 0;
      if (percent <= 0) return;
      const tonnes = roundTonnes((percent / 100) * trailer.capacityT);
      if (tonnes <= 0) return;
      stock.set(pour.binId, roundTonnes((stock.get(pour.binId) ?? 0) - tonnes));
      fills.push({ trailerId: trailer.id, binId: pour.binId, percent });
    });
  }
  return fills;
}

/** Eye fractions of each trailer. Bins with no moisture are skipped. */
export function recommendTruckBlend(input: {
  trailers: FieldBinTrailer[];
  bins: BlendBin[];
  /** Moisture the whole load aims up to, percent. */
  deliverAt: number;
  /** No trailer averages above this. Defaults to the delivery moisture. */
  trailerMax?: number;
}): TruckBlendResult {
  const trailers = input.trailers.filter((trailer) => trailer.id && trailer.capacityT > 0);
  if (trailers.length === 0) return { ok: false, error: 'Add at least one trailer.' };
  if (!Number.isFinite(input.deliverAt) || input.deliverAt < 0 || input.deliverAt > 100) {
    return { ok: false, error: 'Set a delivery moisture between 0 and 100%.' };
  }
  const trailerMax = input.trailerMax ?? input.deliverAt;
  if (!Number.isFinite(trailerMax) || trailerMax < input.deliverAt - 1e-9 || trailerMax > 100) {
    return { ok: false, error: 'The trailer limit has to sit at or above the delivery moisture.' };
  }
  const skippedIds = input.bins.filter((bin) => bin.tonnes > 0 && bin.moisture == null).map((bin) => bin.id);
  const available = input.bins.filter(
    (bin): bin is Lot => Boolean(bin.id) && bin.tonnes > 0 && bin.moisture != null
  );
  if (available.length === 0) {
    return {
      ok: false,
      error: skippedIds.length
        ? 'Set a moisture on a bin that has grain before blending.'
        : 'No bin has grain to load.',
    };
  }
  if (available.every((bin) => bin.moisture > input.deliverAt + 1e-9)) {
    return { ok: false, error: `Every bin is above ${input.deliverAt}% delivery moisture.` };
  }
  const room = Math.max(1, MAX_LINES - trailers.length + 1);
  const kept = available.slice(0, room);
  const stock = kept.reduce((sum, bin) => sum + bin.tonnes, 0);
  const truckCap = truckCapacityT(trailers);
  if (truckCap <= 0 || stock <= 0) return { ok: false, error: 'No bin has grain to load.' };
  const shares = allocateShares(kept, truckCap, input.deliverAt);
  if (shares.length === 0 || shares.reduce((sum, bin) => sum + bin.tonnes, 0) / truckCap < 0.01) {
    return { ok: false, error: 'The bins do not hold enough grain to load.' };
  }
  const moist = new Map(kept.map((bin) => [bin.id, bin.moisture]));
  const fitted = fitTrailerCap(pourShares(trailers, shares), trailers, moist, trailerMax);
  if (!fitted) {
    return { ok: false, error: 'Cannot keep every trailer under that moisture limit.' };
  }
  const fills = fillsFromPours(
    fitted,
    trailers,
    kept.map((bin) => bin.id),
    moist,
    trailerMax,
    new Map(kept.map((bin) => [bin.id, bin.tonnes]))
  );
  if (fills.length === 0) return { ok: false, error: 'The bins do not hold enough grain to load.' };
  if (fills.length > MAX_LINES) return { ok: false, error: 'That blend needs more trailer lines than a load can store.' };
  return { ok: true, fills, skippedIds };
}
