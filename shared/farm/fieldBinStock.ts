/**
 * Field-bin tonnes and moisture. Plans/FIELD_BINS_PLUGIN.md.
 * Pure so the map card and the pack page share one replay. No vehicle balance in v1.
 */

export const TRUCK_COLOR_IDS = ['amber', 'red', 'blue', 'green', 'violet', 'orange', 'teal', 'slate'] as const;
export type TruckColorId = (typeof TRUCK_COLOR_IDS)[number];

export function truckColorId(stored: string | undefined, index = 0): TruckColorId {
  if (stored && (TRUCK_COLOR_IDS as readonly string[]).includes(stored)) return stored as TruckColorId;
  return TRUCK_COLOR_IDS[index % TRUCK_COLOR_IDS.length] ?? 'amber';
}

export type FieldBinVehicleKind = 'chaser' | 'truck';
export type FieldBinDirection = 'in' | 'out';
export type FieldBinPercentBase = 'bin' | 'load' | 'trailer';

export type FieldBinTrailer = {
  id: string;
  capacityT: number;
};

export type FieldBinVehicle = {
  id: string;
  kind: FieldBinVehicleKind;
  name: string;
  /** For a truck with trailers, this is the sum of the trailer capacities. */
  capacityT: number;
  /** Chaser has scales, so a load is entered in tonnes instead of quarters. */
  scales?: boolean;
  /** Truck only. One capacity per trailer. */
  trailers?: FieldBinTrailer[];
  /** Truck only. Chosen on the profile and shown on the load button. */
  color?: TruckColorId;
};

export type FieldBinRecord = {
  capacityT: number;
  cropLabel?: string;
};

export type FieldBinSettings = {
  vehicles: FieldBinVehicle[];
  bins: Record<string, FieldBinRecord>;
};

export type FieldBinMovementLine = {
  binId: string;
  percent: number;
  base: FieldBinPercentBase;
  tonnes: number;
  /** Set when base is `trailer`: percent is of that trailer's capacity. */
  trailerId?: string;
};

export type FieldBinMovement = {
  id: string;
  at: string;
  vehicleId: string;
  direction: FieldBinDirection;
  /** Required on the way in. One figure for every line of that trip. */
  moisture?: number;
  /** Way out: tonne-weighted mix of the bins loaded. Shown on the trip, not kept on the vehicle. */
  mixMoisture?: number;
  note?: string;
  /**
   * Empties current holding. `bin` zeroes the bins on the lines and does not
   * load a vehicle. `vehicle` zeroes that vehicle and does not touch a bin.
   */
  clear?: 'bin' | 'vehicle';
  /** The lines set each bin's tonnes. Moisture already on the grain stays. Zero clears it. */
  setLevel?: true;
  /** Replaces the moisture on the grain already in the bins. Tonnes stay as they are. */
  setMoisture?: true;
  lines: FieldBinMovementLine[];
};

export type BinStock = {
  tonnes: number;
  moisture: number | null;
};

export type TransferDraftLine = {
  binId: string;
  percent: number;
  base: FieldBinPercentBase;
};

export type TransferDraft = {
  vehicleCapacityT: number;
  direction: FieldBinDirection;
  moisture?: number;
  lines: TransferDraftLine[];
  bins: Record<string, { tonnes: number; capacityT: number; moisture: number | null }>;
};

export type PlannedTransfer =
  | { ok: true; lines: FieldBinMovementLine[]; mixMoisture?: number }
  | { ok: false; error: string };

export type TruckFill = {
  trailerId: string;
  binId: string;
  /** Percent of that trailer's capacity, greater than 0 and at most 100. */
  percent: number;
};

export type TruckLoadDraft = {
  trailers: FieldBinTrailer[];
  fills: TruckFill[];
  bins: Record<string, { tonnes: number; capacityT: number; moisture: number | null }>;
};

const TONNE_CAP = 5000;

export function emptyFieldBinSettings(): FieldBinSettings {
  return { vehicles: [], bins: {} };
}

export function roundTonnes(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function formatTonnes(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `${new Intl.NumberFormat('en-AU', { maximumFractionDigits: 2 }).format(n)} t`;
}

export function formatMoisture(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(1)}%`;
}

export function formatFillPercent(filled: number, capacity: number): string {
  if (!Number.isFinite(capacity) || capacity <= 0) return '—';
  return `${Math.round((filled / capacity) * 100)}%`;
}

function finiteIn(n: unknown, min: number, max: number): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function cleanLabel(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, max);
}

export function parseFieldBinSettings(raw: unknown): FieldBinSettings {
  const empty = emptyFieldBinSettings();
  if (!raw || typeof raw !== 'object') return empty;
  const data = raw as { vehicles?: unknown; bins?: unknown };
  const vehicles: FieldBinVehicle[] = [];
  if (Array.isArray(data.vehicles)) {
    for (const row of data.vehicles) {
      if (!row || typeof row !== 'object') continue;
      const v = row as Partial<FieldBinVehicle>;
      const capacityT = finiteIn(v.capacityT, 0.001, TONNE_CAP);
      const name = cleanLabel(v.name, 80);
      const id = cleanLabel(v.id, 80);
      if (!id || !name || capacityT == null) continue;
      if (v.kind !== 'chaser' && v.kind !== 'truck') continue;
      const trailers = v.kind === 'truck' ? parseTrailers(v.trailers) : undefined;
      const summed = trailers?.reduce((sum, trailer) => sum + trailer.capacityT, 0);
      const color =
        v.kind === 'truck' && typeof v.color === 'string' && (TRUCK_COLOR_IDS as readonly string[]).includes(v.color)
          ? (v.color as TruckColorId)
          : undefined;
      vehicles.push({
        id,
        kind: v.kind,
        name,
        capacityT: roundTonnes(summed && summed > 0 ? summed : capacityT),
        ...(v.scales === true ? { scales: true } : {}),
        ...(trailers ? { trailers } : {}),
        ...(color ? { color } : {}),
      });
    }
  }
  const bins: Record<string, FieldBinRecord> = {};
  if (data.bins && typeof data.bins === 'object') {
    for (const [pinId, row] of Object.entries(data.bins as Record<string, unknown>)) {
      if (!pinId || pinId.length > 80 || !row || typeof row !== 'object') continue;
      const rec = row as Partial<FieldBinRecord>;
      const capacityT = finiteIn(rec.capacityT, 0.001, TONNE_CAP);
      if (capacityT == null) continue;
      const cropLabel = cleanLabel(rec.cropLabel, 40);
      bins[pinId] = cropLabel
        ? { capacityT: roundTonnes(capacityT), cropLabel }
        : { capacityT: roundTonnes(capacityT) };
    }
  }
  return { vehicles, bins };
}

export function settingsToWrite(settings: FieldBinSettings): FieldBinSettings {
  return parseFieldBinSettings(settings);
}

function parseLine(raw: unknown, allowZero = false): FieldBinMovementLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const line = raw as Partial<FieldBinMovementLine>;
  const binId = cleanLabel(line.binId, 80);
  const percent = finiteIn(line.percent, 0, 100);
  const tonnes = finiteIn(line.tonnes, 0, TONNE_CAP);
  if (!binId || percent == null || tonnes == null || (tonnes <= 0 && !(allowZero && tonnes === 0))) return null;
  if (line.base !== 'bin' && line.base !== 'load' && line.base !== 'trailer') return null;
  const trailerId = cleanLabel(line.trailerId, 80);
  if (line.base === 'trailer' && !trailerId) return null;
  return {
    binId,
    percent,
    base: line.base,
    tonnes: roundTonnes(tonnes),
    ...(trailerId ? { trailerId } : {}),
  };
}

export function parseFieldBinMovement(raw: unknown): FieldBinMovement | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<FieldBinMovement>;
  const id = cleanLabel(row.id, 80);
  const at = cleanLabel(row.at, 40);
  const vehicleId = cleanLabel(row.vehicleId, 80);
  if (!id || !at || !vehicleId) return null;
  if (row.direction !== 'in' && row.direction !== 'out') return null;
  const clear = row.clear === 'bin' || row.clear === 'vehicle' ? row.clear : undefined;
  if (row.clear != null && clear == null) return null;
  const setLevel = row.setLevel === true ? true : undefined;
  if (row.setLevel != null && !setLevel) return null;
  const setMoisture = row.setMoisture === true ? true : undefined;
  if (row.setMoisture != null && !setMoisture) return null;
  if ((setLevel && clear) || (setMoisture && (clear || setLevel))) return null;
  const moisture = row.moisture == null ? undefined : finiteIn(row.moisture, 0, 100);
  if (setMoisture && moisture == null) return null;
  if (row.direction === 'in' && moisture == null && !setLevel && !setMoisture) return null;
  const mixMoisture = row.mixMoisture == null ? undefined : finiteIn(row.mixMoisture, 0, 100) ?? undefined;
  const note = cleanLabel(row.note, 500);
  if (clear === 'vehicle') {
    if (Array.isArray(row.lines) && row.lines.length > 0) return null;
    return {
      id,
      at,
      vehicleId,
      direction: 'out',
      clear,
      ...(mixMoisture != null ? { mixMoisture } : {}),
      ...(note ? { note } : {}),
      lines: [],
    };
  }
  if (!Array.isArray(row.lines) || row.lines.length === 0 || row.lines.length > 12) return null;
  const lines: FieldBinMovementLine[] = [];
  for (const line of row.lines) {
    const parsed = parseLine(line, setLevel || setMoisture);
    if (!parsed) return null;
    lines.push(parsed);
  }
  return {
    id,
    at,
    vehicleId,
    direction: setLevel || setMoisture ? 'out' : row.direction,
    ...(moisture != null && !setLevel ? { moisture } : {}),
    ...(mixMoisture != null && !setLevel && !setMoisture ? { mixMoisture } : {}),
    ...(note ? { note } : {}),
    ...(clear ? { clear } : {}),
    ...(setLevel ? { setLevel } : {}),
    ...(setMoisture ? { setMoisture } : {}),
    lines,
  };
};

export function parseFieldBinMovements(raw: unknown): FieldBinMovement[] {
  if (!Array.isArray(raw)) return [];
  const out: FieldBinMovement[] = [];
  for (const row of raw) {
    const parsed = parseFieldBinMovement(row);
    if (parsed) out.push(parsed);
  }
  return out;
}

export function movementToWrite(movement: FieldBinMovement): FieldBinMovement {
  const parsed = parseFieldBinMovement(movement);
  if (!parsed) throw new Error('Movement is not valid.');
  return parsed;
}

/** Replay every movement. Later trips win on a tie by id. */
export function stockByBin(movements: FieldBinMovement[]): Record<string, BinStock> {
  const sorted = [...movements].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const bins: Record<string, BinStock> = {};
  for (const movement of sorted) {
    if (movement.clear === 'vehicle') continue;
    if (movement.clear === 'bin') {
      for (const line of movement.lines) bins[line.binId] = { tonnes: 0, moisture: null };
      continue;
    }
    if (movement.setLevel) {
      for (const line of movement.lines) {
        const cur = bins[line.binId] ?? { tonnes: 0, moisture: null };
        const nextT = roundTonnes(line.tonnes);
        bins[line.binId] = { tonnes: nextT, moisture: nextT <= 0 ? null : cur.moisture };
      }
      continue;
    }
    if (movement.setMoisture) {
      const moist = movement.moisture;
      if (moist == null) continue;
      for (const line of movement.lines) {
        const cur = bins[line.binId] ?? { tonnes: 0, moisture: null };
        if (cur.tonnes <= 0) continue;
        bins[line.binId] = { tonnes: cur.tonnes, moisture: moist };
      }
      continue;
    }
    for (const line of movement.lines) {
      const cur = bins[line.binId] ?? { tonnes: 0, moisture: null };
      if (movement.direction === 'in') {
        const add = line.tonnes;
        const nextT = cur.tonnes + add;
        const moist = movement.moisture ?? 0;
        const nextM = nextT > 0 ? (cur.tonnes * (cur.moisture ?? 0) + add * moist) / nextT : null;
        bins[line.binId] = { tonnes: roundTonnes(nextT), moisture: nextM };
      } else {
        const nextT = roundTonnes(Math.max(0, cur.tonnes - line.tonnes));
        bins[line.binId] = {
          tonnes: nextT,
          moisture: nextT <= 0 ? null : cur.moisture,
        };
      }
    }
  }
  return bins;
}

/** Tonnes and moisture sitting on a chaser or truck, replayed from the same movements. */
export function stockByVehicle(movements: FieldBinMovement[]): Record<string, BinStock> {
  const sorted = [...movements].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const vehicles: Record<string, BinStock> = {};
  for (const movement of sorted) {
    if (movement.clear === 'bin' || movement.setLevel || movement.setMoisture) continue;
    if (movement.clear === 'vehicle') {
      vehicles[movement.vehicleId] = { tonnes: 0, moisture: null };
      continue;
    }
    const moved = roundTonnes(movement.lines.reduce((sum, line) => sum + line.tonnes, 0));
    if (moved <= 0) continue;
    const cur = vehicles[movement.vehicleId] ?? { tonnes: 0, moisture: null };
    if (movement.direction === 'out') {
      const moist = movement.mixMoisture ?? movement.moisture ?? 0;
      const nextT = cur.tonnes + moved;
      const nextM = nextT > 0 ? (cur.tonnes * (cur.moisture ?? 0) + moved * moist) / nextT : null;
      vehicles[movement.vehicleId] = { tonnes: roundTonnes(nextT), moisture: nextM };
    } else {
      const nextT = roundTonnes(Math.max(0, cur.tonnes - moved));
      vehicles[movement.vehicleId] = { tonnes: nextT, moisture: nextT <= 0 ? null : cur.moisture };
    }
  }
  return vehicles;
}

/** A hand-set fill. Zero is an empty bin. Above the bin's tonne capacity is refused. */
export function levelChangeError(capacityT: number | null, nextLevelT: number): string | null {
  const level = finiteIn(nextLevelT, 0, TONNE_CAP);
  if (level == null) return `Level must be from 0 to ${TONNE_CAP} t.`;
  if (capacityT != null && capacityT > 0 && level > capacityT + 1e-6) return "Level is above this bin's capacity.";
  return null;
}

/** A hand-set moisture. An empty bin has nothing to measure. */
export function moistureChangeError(filledT: number, nextMoisture: number): string | null {
  if (filledT <= 0) return 'Put grain in the bin before setting a moisture.';
  if (finiteIn(nextMoisture, 0, 100) == null) return 'Moisture must be from 0 to 100%.';
  return null;
}

export function capacityChangeError(filledT: number, nextCapacityT: number): string | null {
  const capacity = finiteIn(nextCapacityT, 0.001, TONNE_CAP);
  if (capacity == null) return `Capacity must be greater than 0 and at most ${TONNE_CAP} t.`;
  if (capacity + 1e-6 < filledT) return 'Capacity is below the grain already in this bin.';
  return null;
}

export function planTransfer(draft: TransferDraft): PlannedTransfer {
  if (draft.lines.length === 0) return { ok: false, error: 'Add at least one bin.' };
  if (draft.lines.length > 12) return { ok: false, error: 'A trip can include at most 12 bins.' };
  const seen = new Set<string>();
  let loadPercent = 0;
  for (const line of draft.lines) {
    if (!line.binId) return { ok: false, error: 'Choose a field bin on every line.' };
    if (seen.has(line.binId)) return { ok: false, error: 'Each field bin can appear once on a trip.' };
    seen.add(line.binId);
    if (!Number.isFinite(line.percent) || line.percent <= 0 || line.percent > 100) {
      return { ok: false, error: 'Each percent must be greater than 0 and at most 100.' };
    }
    if (line.base === 'load') loadPercent += line.percent;
  }
  if (loadPercent > 100 + 1e-6) {
    return { ok: false, error: 'Percents of the load must add up to at most 100.' };
  }
  const capacityT = finiteIn(draft.vehicleCapacityT, 0.001, TONNE_CAP);
  if (capacityT == null) return { ok: false, error: 'That vehicle needs a capacity in tonnes.' };
  if (draft.direction === 'in') {
    const moisture = finiteIn(draft.moisture, 0, 100);
    if (moisture == null) return { ok: false, error: 'Enter a moisture percent for grain going into a bin.' };
  }

  const lines: FieldBinMovementLine[] = [];
  for (const line of draft.lines) {
    const bin = draft.bins[line.binId];
    if (!bin) return { ok: false, error: 'Set a capacity on each field bin before moving grain.' };
    const baseT = line.base === 'bin' ? bin.tonnes : capacityT;
    const tonnes = roundTonnes((line.percent / 100) * baseT);
    if (tonnes <= 0) return { ok: false, error: 'That percent moves no grain.' };
    if (draft.direction === 'out' && tonnes > bin.tonnes + 1e-6) {
      return { ok: false, error: 'That is more grain than the bin is holding.' };
    }
    if (draft.direction === 'in' && bin.tonnes + tonnes > bin.capacityT + 1e-6) {
      return { ok: false, error: 'That load would overfill the bin.' };
    }
    lines.push({ binId: line.binId, percent: line.percent, base: line.base, tonnes });
  }

  if (draft.direction === 'out') {
    let tonnes = 0;
    let weighted = 0;
    for (const line of lines) {
      const moist = draft.bins[line.binId]?.moisture;
      if (moist == null) return { ok: false, error: 'A bin with grain in it needs a moisture before it can load out.' };
      tonnes += line.tonnes;
      weighted += line.tonnes * moist;
    }
    return { ok: true, lines, mixMoisture: tonnes > 0 ? weighted / tonnes : undefined };
  }
  return { ok: true, lines };
}

const MAX_TRAILERS = 6;
const MAX_LINES = 12;

function parseTrailers(raw: unknown): FieldBinTrailer[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const trailers: FieldBinTrailer[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const trailer = row as Partial<FieldBinTrailer>;
    const id = cleanLabel(trailer.id, 80);
    const capacityT = finiteIn(trailer.capacityT, 0.001, TONNE_CAP);
    if (!id || capacityT == null) continue;
    if (trailers.length >= MAX_TRAILERS) break;
    trailers.push({ id, capacityT: roundTonnes(capacityT) });
  }
  return trailers.length > 0 ? trailers : undefined;
}

export function truckCapacityT(trailers: FieldBinTrailer[]): number {
  return roundTonnes(trailers.reduce((sum, trailer) => sum + trailer.capacityT, 0));
}

/**
 * Grain leaving field bins onto a truck. Each fill is a percent of one trailer's
 * capacity. The moisture is the tonne-weighted mix of the whole truck.
 */
export function planTruckLoad(draft: TruckLoadDraft): PlannedTransfer {
  if (draft.trailers.length === 0) return { ok: false, error: 'Add at least one trailer.' };
  if (draft.trailers.length > MAX_TRAILERS) return { ok: false, error: `A truck can have at most ${MAX_TRAILERS} trailers.` };
  if (draft.fills.length === 0) return { ok: false, error: 'Choose a bin for at least one trailer.' };
  if (draft.fills.length > MAX_LINES) return { ok: false, error: 'A truck load can include at most 12 bin lines.' };

  const trailers = new Map<string, FieldBinTrailer>();
  for (const trailer of draft.trailers) {
    if (!trailer.id || trailers.has(trailer.id)) return { ok: false, error: 'Each trailer needs its own id.' };
    if (finiteIn(trailer.capacityT, 0.001, TONNE_CAP) == null) {
      return { ok: false, error: 'Each trailer needs a capacity in tonnes.' };
    }
    trailers.set(trailer.id, trailer);
  }

  const seen = new Set<string>();
  const percentByTrailer = new Map<string, number>();
  for (const fill of draft.fills) {
    if (!trailers.has(fill.trailerId)) return { ok: false, error: 'That fill names a trailer this truck does not have.' };
    if (!fill.binId) return { ok: false, error: 'Choose a field bin on every line.' };
    const key = `${fill.trailerId}:${fill.binId}`;
    if (seen.has(key)) return { ok: false, error: 'Each bin can fill a trailer only once.' };
    seen.add(key);
    if (!Number.isFinite(fill.percent) || fill.percent <= 0 || fill.percent > 100) {
      return { ok: false, error: 'Each percent must be greater than 0 and at most 100.' };
    }
    percentByTrailer.set(fill.trailerId, (percentByTrailer.get(fill.trailerId) ?? 0) + fill.percent);
  }
  for (const total of percentByTrailer.values()) {
    if (total > 100 + 1e-6) return { ok: false, error: 'Percents of one trailer must add up to at most 100.' };
  }

  const lines: FieldBinMovementLine[] = [];
  const drawn = new Map<string, number>();
  for (const fill of draft.fills) {
    const bin = draft.bins[fill.binId];
    const trailer = trailers.get(fill.trailerId);
    if (!bin || !trailer) return { ok: false, error: 'Set a capacity on each field bin before moving grain.' };
    const tonnes = roundTonnes((fill.percent / 100) * trailer.capacityT);
    if (tonnes <= 0) return { ok: false, error: 'That percent moves no grain.' };
    const next = (drawn.get(fill.binId) ?? 0) + tonnes;
    if (next > bin.tonnes + 1e-6) return { ok: false, error: 'That is more grain than the bin is holding.' };
    drawn.set(fill.binId, next);
    lines.push({
      binId: fill.binId,
      percent: fill.percent,
      base: 'trailer',
      tonnes,
      trailerId: fill.trailerId,
    });
  }

  let tonnes = 0;
  let weighted = 0;
  for (const line of lines) {
    const moist = draft.bins[line.binId]?.moisture;
    if (moist == null) return { ok: false, error: 'A bin with grain in it needs a moisture before it can load out.' };
    tonnes += line.tonnes;
    weighted += line.tonnes * moist;
  }
  return { ok: true, lines, mixMoisture: tonnes > 0 ? weighted / tonnes : undefined };
}
