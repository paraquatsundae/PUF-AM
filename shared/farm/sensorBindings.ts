/**
 * Pack-owned sensor identity and source (Plans/FARM_TYPES.md § Map infrastructure).
 * Geometry stays on map pins. Crop packs read this; they do not call vendors.
 */
import { isSensorInfraType, type SensorInfraTypeId } from './infraTypes';

export const SENSOR_SOURCES = ['manual', 'dpird', 'other'] as const;
export type SensorSource = (typeof SENSOR_SOURCES)[number];

export type SensorBinding = {
  source: SensorSource;
  externalId?: string;
  blockId?: string;
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
  if (typeof raw.blockId === 'string' && raw.blockId.trim()) {
    binding.blockId = raw.blockId.trim().slice(0, 80);
  }
  return binding;
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

type PinLike = { id: string; type?: string | null };

/** Pin ids bound to a paddock. Optional class filter (weather / soil / irrigation). */
export function sensorPinsForBlock(
  pins: readonly PinLike[],
  settings: SensorSettings | undefined,
  blockId: string,
  classId?: SensorInfraTypeId,
  packActive = true
): string[] {
  if (!packActive) return [];
  const out: string[] = [];
  for (const pin of pins) {
    if (!isSensorInfraType(pin.type)) continue;
    if (classId && pin.type !== classId) continue;
    if (settings?.bindings[pin.id]?.blockId !== blockId) continue;
    out.push(pin.id);
  }
  return out;
}

export function bindingToWrite(binding: SensorBinding): Record<string, string> {
  const out: Record<string, string> = { source: binding.source };
  const externalId = binding.externalId?.trim().slice(0, 120);
  const blockId = binding.blockId?.trim().slice(0, 80);
  if (externalId) out.externalId = externalId;
  if (blockId) out.blockId = blockId;
  return out;
}
