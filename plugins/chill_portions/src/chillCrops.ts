/**
 * Crop types and varieties the chill pack can score.
 *
 * Walnut figures in `plugins/chill_portions/engine.json` are the published
 * bands from the standalone Chill Portion Calculator
 * (`/home/george/chill_portion_calculator/web/crops.js`), for every variety
 * that file lists. The pass line is the bottom of the band — the same
 * threshold that app uses to leave "below". Vina, Lara and Cisco are not in
 * that file, so they keep the older single estimates. Other crops below are
 * the same calculator's bands. Farm species it does not list have no number.
 */
import { chillCultivars } from '../../../shared/farm/chillPortionsPackage';
import { TREE_SPECIES } from '../../../shared/farm/farmTypes';

export type ChillVarietyRequirement = {
  cropId: string;
  cropName: string;
  id: string;
  name: string;
  /** Portions that count as met. Null when this pack has no published figure. */
  requiredCP: number | null;
  rangeCP?: { min: number; max: number };
};

type StandaloneVariety = {
  cropId: string;
  cropName: string;
  name: string;
  /** Bottom of the published band. */
  cpMin: number;
  cpMax: number;
};

/** Bands copied from the standalone calculator. Species-wide "range" rows are not varieties. */
const STANDALONE_VARIETIES: readonly StandaloneVariety[] = [
  { cropId: 'walnut', cropName: 'Walnut', name: 'Serr', cpMin: 45, cpMax: 60 },
  { cropId: 'almond', cropName: 'Almond', name: 'Nonpareil', cpMin: 20, cpMax: 26 },
  { cropId: 'almond', cropName: 'Almond', name: 'Desmayo Largueta', cpMin: 25, cpMax: 32 },
  { cropId: 'almond', cropName: 'Almond', name: 'Ferragnès', cpMin: 28, cpMax: 36 },
  { cropId: 'cherry', cropName: 'Cherry', name: 'Cristobalina', cpMin: 28, cpMax: 34 },
  { cropId: 'cherry', cropName: 'Cherry', name: 'Lapins', cpMin: 32, cpMax: 40 },
  { cropId: 'cherry', cropName: 'Cherry', name: 'Brooks', cpMin: 34, cpMax: 40 },
  { cropId: 'cherry', cropName: 'Cherry', name: 'Rainier', cpMin: 42, cpMax: 50 },
  { cropId: 'cherry', cropName: 'Cherry', name: 'Burlat', cpMin: 45, cpMax: 52 },
  { cropId: 'cherry', cropName: 'Cherry', name: 'Ruby', cpMin: 45, cpMax: 52 },
  { cropId: 'cherry', cropName: 'Cherry', name: 'Somerset', cpMin: 45, cpMax: 52 },
  { cropId: 'cherry', cropName: 'Cherry', name: 'New Star', cpMin: 50, cpMax: 58 },
  { cropId: 'cherry', cropName: 'Cherry', name: 'Marvin', cpMin: 54, cpMax: 62 },
  { cropId: 'cherry', cropName: 'Cherry', name: 'Sam', cpMin: 65, cpMax: 75 },
  { cropId: 'apricot', cropName: 'Apricot', name: 'Currot', cpMin: 32, cpMax: 42 },
  { cropId: 'apricot', cropName: 'Apricot', name: 'Rojo Pasión', cpMin: 46, cpMax: 56 },
  { cropId: 'apricot', cropName: 'Apricot', name: 'Búlida', cpMin: 50, cpMax: 58 },
  { cropId: 'apricot', cropName: 'Apricot', name: 'San Castrese', cpMin: 52, cpMax: 58 },
  { cropId: 'apricot', cropName: 'Apricot', name: 'Murciana', cpMin: 52, cpMax: 60 },
  { cropId: 'apricot', cropName: 'Apricot', name: 'Dorada', cpMin: 52, cpMax: 60 },
  { cropId: 'apricot', cropName: 'Apricot', name: 'Selene', cpMin: 54, cpMax: 62 },
  { cropId: 'apricot', cropName: 'Apricot', name: 'Goldrich', cpMin: 56, cpMax: 68 },
  { cropId: 'apricot', cropName: 'Apricot', name: 'Bergeron', cpMin: 60, cpMax: 70 },
  { cropId: 'apricot', cropName: 'Apricot', name: 'Orange Red', cpMin: 62, cpMax: 74 },
  { cropId: 'peach', cropName: 'Peach', name: 'Flordaprince', cpMin: 6, cpMax: 12 },
  { cropId: 'peach', cropName: 'Peach', name: 'Earligrande', cpMin: 10, cpMax: 16 },
  { cropId: 'peach', cropName: 'Peach', name: 'Maravilha', cpMin: 10, cpMax: 16 },
  { cropId: 'peach', cropName: 'Peach', name: 'Redhaven', cpMin: 70, cpMax: 80 },
  { cropId: 'nectarine', cropName: 'Nectarine', name: 'Aprilglo', cpMin: 10, cpMax: 16 },
  { cropId: 'nectarine', cropName: 'Nectarine', name: 'Mayglo', cpMin: 15, cpMax: 22 },
  { cropId: 'nectarine', cropName: 'Nectarine', name: 'Sunlite', cpMin: 28, cpMax: 40 },
  { cropId: 'nectarine', cropName: 'Nectarine', name: 'Flavortop', cpMin: 35, cpMax: 48 },
  { cropId: 'nectarine', cropName: 'Nectarine', name: 'Fantasia', cpMin: 35, cpMax: 48 },
  { cropId: 'pistachio', cropName: 'Pistachio', name: 'Kerman', cpMin: 52, cpMax: 62 },
  { cropId: 'apple', cropName: 'Apple', name: 'Golden Delicious', cpMin: 46, cpMax: 56 },
];

function foldName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function slug(name: string): string {
  return foldName(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildCatalog(): ChillVarietyRequirement[] {
  const byName = new Map<string, ChillVarietyRequirement>();

  for (const cultivar of chillCultivars) {
    byName.set(foldName(cultivar.name), {
      cropId: 'walnut',
      cropName: 'Walnut',
      id: cultivar.id,
      name: cultivar.name,
      requiredCP: cultivar.requiredCP,
      rangeCP: cultivar.rangeCP,
    });
  }

  for (const row of STANDALONE_VARIETIES) {
    const key = foldName(row.name);
    if (byName.has(key)) continue;
    byName.set(key, {
      cropId: row.cropId,
      cropName: row.cropName,
      id: `${row.cropId}-${slug(row.name)}`,
      name: row.name,
      requiredCP: row.cpMin,
      rangeCP: { min: row.cpMin, max: row.cpMax },
    });
  }

  for (const species of TREE_SPECIES) {
    if (species.id === 'other_tree') continue;
    for (const name of species.cultivars) {
      if (name === 'Other') continue;
      const key = foldName(name);
      if (byName.has(key)) continue;
      byName.set(key, {
        cropId: species.id,
        cropName: species.label,
        id: `${species.id}-${slug(name)}`,
        name,
        requiredCP: null,
      });
    }
  }

  return [...byName.values()];
}

export const CHILL_VARIETY_REQUIREMENTS: readonly ChillVarietyRequirement[] = buildCatalog();

const REQUIREMENT_BY_NAME = new Map(
  CHILL_VARIETY_REQUIREMENTS.map((row) => [foldName(row.name), row])
);

/** Known variety, or null when the name is blank or not in the catalog. */
export function lookupChillRequirement(
  cultivarName?: string | null
): ChillVarietyRequirement | null {
  const key = foldName(cultivarName ?? '');
  if (!key) return null;
  return REQUIREMENT_BY_NAME.get(key) ?? null;
}

/** Label for a known requirement. Null when the variety has no figure. */
export function chillRequirementLabel(variety: ChillVarietyRequirement): string | null {
  if (typeof variety.requiredCP !== 'number') return null;
  const range = variety.rangeCP;
  if (range && range.max !== range.min) return `${range.min}–${range.max} CP`;
  return `${variety.requiredCP} CP`;
}

export type ChillVarietyOnBlock = {
  cultivar: string;
  /** Uncovered remainder of the paddock, labelled with the block cultivar. */
  rest: boolean;
};

/**
 * Varieties to score on one block.
 * No drawn parts: the block cultivar alone (possibly blank).
 * Drawn parts: each part, then the rest of the paddock under `block.cultivar`.
 */
export function chillVarietiesOnBlock(block: {
  cultivar?: string | null;
  cultivarParts?: readonly { cultivar?: string | null }[] | null;
}): ChillVarietyOnBlock[] {
  const parts = block.cultivarParts ?? [];
  if (parts.length === 0) {
    return [{ cultivar: (block.cultivar ?? '').trim(), rest: false }];
  }
  return [
    ...parts.map((part) => ({ cultivar: (part.cultivar ?? '').trim(), rest: false })),
    { cultivar: (block.cultivar ?? '').trim(), rest: true },
  ];
}
