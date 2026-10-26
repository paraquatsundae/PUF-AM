/**
 * Pack-owned sensor identity and source (Plans/FARM_TYPES.md § Map infrastructure).
 * Geometry stays on map pins. Crop packs read this; they do not call vendors.
 *
 * Paddocks come from the pin plus its coverage radius. `blockIds` is a manual
 * override: present (even empty) means that list, not the circle.
 */
import { isSensorInfraType, type SensorInfraTypeId } from './infraTypes';
import {
  blockIdsInCoverage,
  clampSensorRadiusM,
  effectiveSensorRadiusM,
} from './sensorCoverage';

export const SENSOR_SOURCES = ['manual', 'dpird', 'other'] as const;
export type SensorSource = (typeof SENSOR_SOURCES)[number];

export type SensorBinding = {
  source: SensorSource;
  externalId?: string;
  /** Metres. Omitted until the operator sets one; the class default applies. */
  radiusM?: number;
  /** Manual paddock ids. Absent means "whatever the coverage circle hits". */
  blockIds?: string[];
};

export type SensorSettings = {
  bindings: Record<string, SensorBinding>;
};

const EMPTY: SensorSettings = { bindings: {} };

export function isSensorSource(value: unknown): value is SensorSource {
  return typeof value === 'string' && (SENSOR_SOURCES as readonly string[]).includes(value);
}

export function parseSensorBinding(input: unknown): SensorBinding | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  if (!isSensorSource(raw.source)) return null;
  const binding: SensorBinding = { source: raw.source };
  if (typeof raw.externalId === 'string' && raw.externalId.trim()) {
    binding.externalId = raw.externalId.trim().slice(0, 120);
  }
  if (typeof raw.radiusM === 'number' && Number.isFinite(raw.radiusM)) {
    binding.radiusM = clampSensorRadiusM(raw.radiusM);
  }
  const manual = manualBlockIds(raw);
  if (manual) binding.blockIds = manual;
  return binding;
}

function cleanBlockId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim().slice(0, 80);
  return id || null;
}

/** Legacy `blockId` is one manual paddock. An array, even empty, is the override. */
function manualBlockIds(raw: { blockIds?: unknown; blockId?: unknown }): string[] | null {
  if (Array.isArray(raw.blockIds)) {
    const ids: string[] = [];
    for (const value of raw.blockIds) {
      const id = cleanBlockId(value);
      if (id && !ids.includes(id)) ids.push(id);
      if (ids.length >= 100) break;
    }
    return ids;
  }
  const legacy = cleanBlockId(raw.blockId);
  return legacy ? [legacy] : null;
}

export function parseSensorSettings(input: unknown): SensorSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ...EMPTY, bindings: {} };
  const raw = (input as Record<string, unknown>).bindings;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY, bindings: {} };
  const bindings: Record<string, SensorBinding> = {};
  for (const [pinId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!pinId.trim()) continue;
    const parsed = parseSensorBinding(value);
    if (parsed) bindings[pinId] = parsed;
  }
  return { bindings };
}

export function defaultBinding(): SensorBinding {
  return { source: 'manual' };
}

export function bindingForPin(
  settings: SensorSettings | undefined,
  pinId: string,
  packActive = true
): SensorBinding | undefined {
  if (!packActive) return defaultBinding();
  return settings?.bindings[pinId];
}

type PinLike = { id: string; type?: string | null; lat?: number; lng?: number };

export type SensorBlockShape = { id: string; geojson?: unknown };

/**
 * Paddocks for one sensor. A stored `blockIds` list wins. Otherwise the pin's
 * circle (its radius, or the class default) decides.
 */
export function resolvedBlockIds(
  binding: SensorBinding,
  pin: { lat?: number; lng?: number; type?: string | null },
  blocks: readonly SensorBlockShape[]
): string[] {
  if (Array.isArray(binding.blockIds)) return binding.blockIds;
  if (typeof pin.lat !== 'number' || typeof pin.lng !== 'number') return [];
  return blockIdsInCoverage(
    pin.lat,
    pin.lng,
    effectiveSensorRadiusM(pin.type, binding.radiusM),
    blocks
  );
}

/** Pin ids assigned to a paddock. Optional class filter (weather / soil / irrigation). */
export function sensorPinsForBlock(
  pins: readonly PinLike[],
  settings: SensorSettings | undefined,
  blockId: string,
  classId?: SensorInfraTypeId,
  packActive = true,
  blocks: readonly SensorBlockShape[] = []
): string[] {
  if (!packActive) return [];
  const out: string[] = [];
  for (const pin of pins) {
    if (!isSensorInfraType(pin.type)) continue;
    if (classId && pin.type !== classId) continue;
    const binding = settings?.bindings[pin.id] ?? defaultBinding();
    if (!resolvedBlockIds(binding, pin, blocks).includes(blockId)) continue;
    out.push(pin.id);
  }
  return out;
}

export function bindingToWrite(binding: SensorBinding): {
  source: SensorSource;
  externalId?: string;
  radiusM?: number;
  blockIds?: string[];
} {
  const out: {
    source: SensorSource;
    externalId?: string;
    radiusM?: number;
    blockIds?: string[];
  } = { source: binding.source };
  const externalId = binding.externalId?.trim().slice(0, 120);
  if (externalId) out.externalId = externalId;
  if (typeof binding.radiusM === 'number' && Number.isFinite(binding.radiusM)) {
    out.radiusM = clampSensorRadiusM(binding.radiusM);
  }
  if (Array.isArray(binding.blockIds)) out.blockIds = manualBlockIds(binding) ?? [];
  return out;
}
