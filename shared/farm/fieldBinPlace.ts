/**
 * Take a field bin off the map and put it back down. The pin id stays, so
 * capacity and movements stay with the same bin. Plans/FIELD_BINS_PLUGIN.md.
 */
import type { FieldBinRecord, FieldBinSettings } from './fieldBinStock';

export type FieldBinPlace = {
  id: string;
  name: string;
  notes?: string;
  /** Null while the bin is off the map. */
  lat: number | null;
  lng: number | null;
};

type PinLike = {
  id: string;
  name?: string;
  type?: string;
  notes?: string;
  lat: number;
  lng: number;
};

function clip(value: string, max: number): string {
  return value.trim().slice(0, max);
}

/** Remember the name and notes on the bin record, then the pin can be deleted. */
export function parkFieldBin(settings: FieldBinSettings, pin: { id: string; name?: string; notes?: string }): FieldBinSettings {
  const id = clip(pin.id, 80);
  if (!id) return settings;
  const existing = settings.bins[id] ?? {};
  const parkedName = clip(pin.name || existing.parkedName || 'Field bin', 99) || 'Field bin';
  const notes = clip(pin.notes ?? existing.parkedNotes ?? '', 1990);
  const next: FieldBinRecord = { ...existing, parkedName };
  if (notes) next.parkedNotes = notes;
  else delete next.parkedNotes;
  return { ...settings, bins: { ...settings.bins, [id]: next } };
}

/** Drop the parked name once a pin exists again. Capacity stays. */
export function unparkFieldBin(settings: FieldBinSettings, pinId: string): FieldBinSettings {
  const existing = settings.bins[pinId];
  if (!existing?.parkedName) return settings;
  const next: FieldBinRecord = { ...existing };
  delete next.parkedName;
  delete next.parkedNotes;
  const bins = { ...settings.bins };
  if (next.capacityT == null && !next.cropLabel) delete bins[pinId];
  else bins[pinId] = next;
  return { ...settings, bins };
}

/** Placed pins, then bins that are off the map. A pin still on the map wins. */
export function fieldBinPlaces(pins: PinLike[], settings: FieldBinSettings): FieldBinPlace[] {
  const placed = pins.filter((pin) => pin.type === 'field_bin');
  const placedIds = new Set(placed.map((pin) => pin.id));
  const onMap: FieldBinPlace[] = placed.map((pin) => ({
    id: pin.id,
    name: pin.name || 'Field bin',
    ...(pin.notes ? { notes: pin.notes } : {}),
    lat: pin.lat,
    lng: pin.lng,
  }));
  const parked: FieldBinPlace[] = Object.entries(settings.bins)
    .filter(([id, record]) => record.parkedName && !placedIds.has(id))
    .map(([id, record]) => ({
      id,
      name: record.parkedName || 'Field bin',
      ...(record.parkedNotes ? { notes: record.parkedNotes } : {}),
      lat: null,
      lng: null,
    }));
  return [...onMap, ...parked];
}
