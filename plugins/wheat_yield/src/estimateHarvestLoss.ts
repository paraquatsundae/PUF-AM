/**
 * Drop-tray harvest loss. Plans/WHEAT_YIELD_PLUGIN.md.
 *
 * A weighed tray: kg/ha on the ground = grams × 10 / tray area (m²).
 * That is the GRDC chop-and-spread factor (a 0.5 m² tray is grams × 20).
 * A grain count uses a standard grains-per-gram figure and the same formula.
 * Bands across the spread are equal slices. Trays in one band are averaged,
 * those bands are averaged, then scaled by spread width ÷ header width
 * (DPIRD: sieve width / width of cut).
 */
export const TRAYS = [
  { id: 'square30', label: '30 × 30 cm', areaM2: 0.3 * 0.3 },
  { id: 'round30', label: 'Round 30 cm', areaM2: Math.PI * 0.15 * 0.15 },
  { id: 'long', label: '1.5 × 0.25 m', areaM2: 1.5 * 0.25 },
] as const;

export type TrayId = (typeof TRAYS)[number]['id'];

/** A tray made on the farm. Rectangle uses both sides. Round uses widthCm as the diameter. */
export type CustomTray = {
  id: string;
  label: string;
  shape: 'rect' | 'round';
  widthCm: number;
  lengthCm: number;
};

export const MAX_CUSTOM_TRAYS = 12;

/** Grains per gram. Canola is the figure used on this farm. The others are the GRDC 0.1 m² counts for 1 t/ha, divided by 10 g. */
export const LOSS_CROPS = [
  { id: 'canola', label: 'Canola', grainsPerGram: 290 },
  { id: 'wheat', label: 'Wheat', grainsPerGram: 27 },
  { id: 'barley', label: 'Barley', grainsPerGram: 23 },
  { id: 'oats', label: 'Oats', grainsPerGram: 29 },
  { id: 'lupin', label: 'Lupin', grainsPerGram: 7 },
] as const;

export type LossCropId = (typeof LOSS_CROPS)[number]['id'];

export const SPREAD_ZONES = [
  { id: 'l2', label: 'Far left' },
  { id: 'l1', label: 'Left' },
  { id: 'c', label: 'Centre' },
  { id: 'r1', label: 'Right' },
  { id: 'r2', label: 'Far right' },
] as const;

export type SpreadZoneId = (typeof SPREAD_ZONES)[number]['id'];

export type LossDrop = {
  /** Preset id, or a saved custom tray id. */
  tray: string;
  zone: SpreadZoneId;
  /** Square metres copied onto the drop so a removed tray still calculates. */
  areaM2?: number;
  /** Set when the tray was weighed. */
  grams?: number;
  /** Set when the grains were counted instead. */
  grains?: number;
};

export type HarvestLossCalculation = {
  id: string;
  cropId: LossCropId;
  headerM: number;
  spreadM: number;
  drops: LossDrop[];
};

const MAX_CALCS = 20;
const MAX_DROPS = 12;

export function lossCrop(id: string | undefined) {
  return LOSS_CROPS.find((crop) => crop.id === id) ?? null;
}

export function trayAreaM2(tray: TrayId): number {
  return TRAYS.find((row) => row.id === tray)?.areaM2 ?? TRAYS[0].areaM2;
}

/** Area of a made tray. Sides are centimetres, from 5 to 250. */
export function customTrayAreaM2(tray: Pick<CustomTray, 'shape' | 'widthCm' | 'lengthCm'>): number | null {
  const width = tray.widthCm;
  const length = tray.shape === 'round' ? tray.widthCm : tray.lengthCm;
  if (!Number.isFinite(width) || !Number.isFinite(length)) return null;
  if (width < 5 || width > 250 || length < 5 || length > 250) return null;
  if (tray.shape === 'round') return Math.PI * (width / 200) * (width / 200);
  return (width / 100) * (length / 100);
}

export function trayChoiceLabel(id: string, trays: CustomTray[]): string {
  return TRAYS.find((row) => row.id === id)?.label ?? trays.find((row) => row.id === id)?.label ?? 'Saved tray';
}

/** Preset area, else the saved tray, else the area copied onto the drop. */
export function areaForDrop(drop: LossDrop, trays: CustomTray[]): number | null {
  const preset = TRAYS.find((row) => row.id === drop.tray);
  if (preset) return preset.areaM2;
  const custom = trays.find((row) => row.id === drop.tray);
  const fromLibrary = custom ? customTrayAreaM2(custom) : null;
  if (fromLibrary != null) return fromLibrary;
  if (drop.areaM2 != null && Number.isFinite(drop.areaM2) && drop.areaM2 > 0 && drop.areaM2 <= 4) return drop.areaM2;
  return null;
}

export function gramsFromCount(grains: number, grainsPerGram: number): number | null {
  if (!Number.isFinite(grains) || grains < 0) return null;
  if (!Number.isFinite(grainsPerGram) || grainsPerGram <= 0) return null;
  return grains / grainsPerGram;
}

/** Kilograms per hectare on the ground under the tray. */
export function trayKgPerHa(grams: number, areaM2: number): number | null {
  if (!Number.isFinite(grams) || grams < 0) return null;
  if (!Number.isFinite(areaM2) || areaM2 <= 0) return null;
  return (grams * 10) / areaM2;
}

export type LossBand = { zone: SpreadZoneId; kgPerHa: number | null; dropCount: number };

export type PlannedHarvestLoss =
  | {
      ok: true;
      kgPerHa: number;
      groundKgPerHa: number;
      bandsUsed: number;
      bandCount: number;
      dropCount: number;
      bands: LossBand[];
    }
  | { ok: false; error: string };

function dropGrams(drop: LossDrop, grainsPerGram: number): number | null {
  if (drop.grains != null) return gramsFromCount(drop.grains, grainsPerGram);
  if (drop.grams != null && Number.isFinite(drop.grams) && drop.grams >= 0) return drop.grams;
  return null;
}

/** One calculation: several trays, then scale the spread back to the header. */
export function planHarvestLoss(input: {
  headerM: number;
  spreadM: number;
  grainsPerGram: number;
  drops: LossDrop[];
  trays?: CustomTray[];
}): PlannedHarvestLoss {
  if (!Number.isFinite(input.headerM) || input.headerM <= 0) {
    return { ok: false, error: 'Enter the header width.' };
  }
  if (!Number.isFinite(input.spreadM) || input.spreadM <= 0) {
    return { ok: false, error: 'Enter the spread width.' };
  }
  const trays = input.trays ?? [];
  const byZone = new Map<SpreadZoneId, number[]>();
  let dropCount = 0;
  for (const drop of input.drops) {
    const grams = dropGrams(drop, input.grainsPerGram);
    if (grams == null) continue;
    const loss = trayKgPerHa(grams, areaForDrop(drop, trays) ?? 0);
    if (loss == null) continue;
    const rows = byZone.get(drop.zone) ?? [];
    rows.push(loss);
    byZone.set(drop.zone, rows);
    dropCount += 1;
  }
  if (dropCount === 0) return { ok: false, error: 'Add a drop with a weight or a grain count.' };
  const bands: LossBand[] = SPREAD_ZONES.map((zone) => {
    const values = byZone.get(zone.id) ?? [];
    const kgPerHa = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    return { zone: zone.id, kgPerHa, dropCount: values.length };
  });
  const used = bands.filter((band) => band.kgPerHa != null);
  const ground = used.reduce((sum, band) => sum + (band.kgPerHa ?? 0), 0) / used.length;
  return {
    ok: true,
    groundKgPerHa: ground,
    kgPerHa: ground * (input.spreadM / input.headerM),
    bandsUsed: used.length,
    bandCount: SPREAD_ZONES.length,
    dropCount,
    bands,
  };
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function customTrayId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  if (!/^[A-Za-z0-9-]{8,40}$/.test(id)) return null;
  if (TRAYS.some((row) => row.id === id)) return null;
  return id;
}

/** Saved trays from a loss document or this device. Invalid rows are dropped. */
export function parseCustomTrays(raw: unknown): CustomTray[] {
  if (!Array.isArray(raw)) return [];
  const trays: CustomTray[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const tray = row as Record<string, unknown>;
    const id = customTrayId(tray.id);
    const label = typeof tray.label === 'string' ? tray.label.trim().slice(0, 32) : '';
    const shape = tray.shape === 'round' || tray.shape === 'rect' ? tray.shape : null;
    const widthCm = finite(tray.widthCm);
    const lengthCm = finite(tray.lengthCm);
    if (!id || !label || !shape || widthCm == null || lengthCm == null) continue;
    if (customTrayAreaM2({ shape, widthCm, lengthCm }) == null) continue;
    if (trays.some((kept) => kept.id === id)) continue;
    trays.push({ id, label, shape, widthCm, lengthCm: shape === 'round' ? widthCm : lengthCm });
    if (trays.length >= MAX_CUSTOM_TRAYS) break;
  }
  return trays;
}

export function parseHarvestLossCalculations(raw: unknown): HarvestLossCalculation[] {
  if (!Array.isArray(raw)) return [];
  const calculations: HarvestLossCalculation[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const calc = row as Record<string, unknown>;
    const id = typeof calc.id === 'string' ? calc.id.trim().slice(0, 80) : '';
    const crop = lossCrop(typeof calc.cropId === 'string' ? calc.cropId : '');
    const headerM = finite(calc.headerM);
    const spreadM = finite(calc.spreadM);
    if (!id || !crop || headerM == null || headerM <= 0 || headerM > 40) continue;
    if (spreadM == null || spreadM <= 0 || spreadM > 60) continue;
    const drops: LossDrop[] = [];
    if (Array.isArray(calc.drops)) {
      for (const item of calc.drops) {
        if (!item || typeof item !== 'object') continue;
        const drop = item as Record<string, unknown>;
        const preset = TRAYS.find((option) => option.id === drop.tray)?.id;
        const custom = customTrayId(drop.tray);
        const zone = SPREAD_ZONES.find((option) => option.id === drop.zone)?.id;
        const areaM2 = finite(drop.areaM2);
        if ((!preset && !custom) || !zone) continue;
        if (custom && (areaM2 == null || areaM2 <= 0 || areaM2 > 4)) continue;
        const grams = finite(drop.grams);
        const grains = finite(drop.grains);
        const tray = preset ?? custom;
        if (!tray) continue;
        if (grains != null && grains >= 0 && grains <= 100000) {
          drops.push(custom ? { tray, zone, grains, areaM2: areaM2 ?? undefined } : { tray, zone, grains });
        } else if (grams != null && grams >= 0 && grams <= 5000) {
          drops.push(custom ? { tray, zone, grams, areaM2: areaM2 ?? undefined } : { tray, zone, grams });
        }
        if (drops.length >= MAX_DROPS) break;
      }
    }
    calculations.push({ id, cropId: crop.id, headerM, spreadM, drops });
    if (calculations.length >= MAX_CALCS) break;
  }
  return calculations;
}
