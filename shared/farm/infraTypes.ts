/**
 * Mappable farm infrastructure catalog (D-05 / D-05b).
 * Point / line / area assets on the Farm Map — sensors plus dams, pipes, vehicles, etc.
 */

export const INFRA_TYPE_IDS = [
  'weather',
  'soil',
  'irrigation',
  'dam',
  'internal_passable',
  'internal_impassable',
  'pipeline',
  'standpipe',
  'vehicle',
  'fuel',
  'hazard',
  '',
] as const;

export type InfraTypeId = (typeof INFRA_TYPE_IDS)[number];

export type InfraDrawMode = 'point' | 'line' | 'polygon';

/** SVG fill pattern key for area assets (OrchardMap injects matching defs). */
export type InfraFillPattern = 'water' | 'hatch' | 'gravel';

export type InfraTypeDef = {
  id: Exclude<InfraTypeId, ''>;
  label: string;
  shortLabel: string;
  blurb: string;
  draw: InfraDrawMode;
  /** Leaflet-ish accent for markers / fills */
  color: string;
  /** Area fill pattern; null/undefined = solid tint */
  fillPattern?: InfraFillPattern | null;
};

export const INFRA_TYPES: readonly InfraTypeDef[] = [
  {
    id: 'weather',
    label: 'Weather station',
    shortLabel: 'Weather',
    blurb: 'On-farm weather / telemetry pin.',
    draw: 'point',
    color: '#2563eb',
  },
  {
    id: 'soil',
    label: 'Soil moisture probe',
    shortLabel: 'Soil',
    blurb: 'Probe or sensor location.',
    draw: 'point',
    color: '#d97706',
  },
  {
    id: 'irrigation',
    label: 'Irrigation valve / node',
    shortLabel: 'Irrigation',
    blurb: 'Valve, solenoid, or control node.',
    draw: 'point',
    color: '#0891b2',
  },
  {
    id: 'dam',
    label: 'Dam / water body',
    shortLabel: 'Dam',
    blurb: 'Draw the water surface. Overlap is removed from paddock usable area.',
    draw: 'polygon',
    color: '#0284c7',
    fillPattern: 'water',
  },
  {
    id: 'internal_passable',
    label: 'Internal pad (passable)',
    shortLabel: 'Pad (passable)',
    blurb: 'Gravel pad / hardstand inside a paddock. Visible; does not reduce paddock area.',
    draw: 'polygon',
    color: '#a8a29e',
    fillPattern: 'gravel',
  },
  {
    id: 'internal_impassable',
    label: 'Hazard zone (impassable)',
    shortLabel: 'Hazard zone / impassable',
    blurb: 'Deep drain, rock pile, or other impassable internal area. Subtracts from paddock usable area.',
    draw: 'polygon',
    color: '#9a3412',
    fillPattern: 'hatch',
  },
  {
    id: 'pipeline',
    label: 'Pipeline',
    shortLabel: 'Pipe',
    blurb: 'Draw the pipe route as a line.',
    draw: 'line',
    color: '#0e7490',
  },
  {
    id: 'standpipe',
    label: 'Standpipe',
    shortLabel: 'Standpipe',
    blurb: 'Fill point / hydrant pin.',
    draw: 'point',
    color: '#0369a1',
  },
  {
    id: 'vehicle',
    label: 'Vehicle',
    shortLabel: 'Vehicle',
    blurb: 'Parked / home pin. Optional Meshy (or similar) tracker id later.',
    draw: 'point',
    color: '#4f46e5',
  },
  {
    id: 'fuel',
    label: 'Fuel point',
    shortLabel: 'Fuel',
    blurb: 'Diesel / AdBlue / fuel storage.',
    draw: 'point',
    color: '#b45309',
  },
  {
    id: 'hazard',
    label: 'Hazard',
    shortLabel: 'Hazard',
    blurb: 'Powerlines, soft ground, chemical store, etc.',
    draw: 'point',
    color: '#dc2626',
  },
] as const;

const BY_ID = Object.fromEntries(INFRA_TYPES.map((t) => [t.id, t])) as Record<
  Exclude<InfraTypeId, ''>,
  InfraTypeDef
>;

/** Types whose polygon overlap is removed from paddock usable area (areaHa). */
const SUBTRACTS_FROM_PADDOCK = new Set<string>(['dam', 'internal_impassable']);

export function getInfraType(id: string | undefined | null): InfraTypeDef | null {
  if (!id || id === '') return null;
  return BY_ID[id as Exclude<InfraTypeId, ''>] || null;
}

export function infraDrawMode(id: string | undefined | null): InfraDrawMode {
  return getInfraType(id)?.draw || 'point';
}

export function isInfraTypeId(v: string): v is Exclude<InfraTypeId, ''> {
  return v !== '' && v in BY_ID;
}

/** True for dam / impassable internal zones (and future area subtractors). */
export function infraSubtractsFromPaddock(type: string | undefined | null): boolean {
  return !!type && SUBTRACTS_FROM_PADDOCK.has(type);
}

export function infraFillPattern(
  type: string | undefined | null
): InfraFillPattern | null {
  return getInfraType(type)?.fillPattern ?? null;
}

export function defaultInfraName(type: InfraTypeId, index: number): string {
  const def = getInfraType(type);
  const label = def?.shortLabel || 'Asset';
  return `${label} ${index}`;
}
