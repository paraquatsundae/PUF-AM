/**
 * Farm enterprise / crop-type catalog for PUFAM.
 *
 * Skeleton only — seasonal rotations, station water-zones, marron dams, and
 * livestock movement tracking land in later phases (see Plans/FARM_TYPES.md).
 */

/** Top-level land-use / enterprise a farm (or paddock) can run. */
export const FARM_ENTERPRISE_IDS = [
  'orchard_tree',
  'fruit',
  'vineyard',
  'broadacre',
  'hort_veg',
  'station',
  'aquaculture',
] as const;

export type FarmEnterpriseId = (typeof FARM_ENTERPRISE_IDS)[number];

export type FarmEnterpriseDef = {
  id: FarmEnterpriseId;
  label: string;
  shortLabel: string;
  blurb: string;
  /**
   * How paddock identity is usually described when naming a block.
   * - species_cultivar: tree/vine — pick species, then cultivar/variety
   * - seasonal_crop: broadacre / hort — crop changes by season (skeleton)
   * - water_zone: station — zone around water, not a hard crop boundary
   * - dam: aquaculture — marron / water body
   */
  paddockModel: 'species_cultivar' | 'seasonal_crop' | 'water_zone' | 'dam';
  /** Secondary field label on the naming sheet (when applicable). */
  varietyLabel: string;
};

export const FARM_ENTERPRISES: readonly FarmEnterpriseDef[] = [
  {
    id: 'orchard_tree',
    label: 'Orchard / tree crop',
    shortLabel: 'Orchard',
    blurb: 'Nuts and orchard trees — species first (e.g. walnut), then cultivar (e.g. Howard).',
    paddockModel: 'species_cultivar',
    varietyLabel: 'Cultivar',
  },
  {
    id: 'fruit',
    label: 'Fruit orchard',
    shortLabel: 'Fruit',
    blurb: 'Pome, stone, citrus and similar — species then variety/cultivar.',
    paddockModel: 'species_cultivar',
    varietyLabel: 'Variety / cultivar',
  },
  {
    id: 'vineyard',
    label: 'Vineyard',
    shortLabel: 'Vines',
    blurb: 'Wine or table grapes — variety (and clone later).',
    paddockModel: 'species_cultivar',
    varietyLabel: 'Variety',
  },
  {
    id: 'broadacre',
    label: 'Broadacre',
    shortLabel: 'Broadacre',
    blurb: 'Season-by-season cropping. Rotation detail comes later — skeleton only for now.',
    paddockModel: 'seasonal_crop',
    varietyLabel: 'Crop / variety',
  },
  {
    id: 'hort_veg',
    label: 'Horticulture / vegetables',
    shortLabel: 'Hort / veg',
    blurb: 'Similar to broadacre — seasonal plantings; full rotation UI later.',
    paddockModel: 'seasonal_crop',
    varietyLabel: 'Crop / variety',
  },
  {
    id: 'station',
    label: 'Station / dairy / grazing',
    shortLabel: 'Grazing',
    blurb:
      'Permanent grazing or dairy. Paddocks are often zones around water, not crop lines — structure first.',
    paddockModel: 'water_zone',
    varietyLabel: 'Pasture / use',
  },
  {
    id: 'aquaculture',
    label: 'Aquaculture (marron dams)',
    shortLabel: 'Aqua',
    blurb: 'Water bodies / marron dams — dam identity rather than crop boundary.',
    paddockModel: 'dam',
    varietyLabel: 'Stock / species',
  },
] as const;

/** Tree / vine species used under species→cultivar enterprises. */
export const TREE_SPECIES_IDS = [
  'walnut',
  'almond',
  'avocado',
  'olive',
  'citrus',
  'apple',
  'pear',
  'cherry',
  'grape',
  'other_tree',
] as const;

export type TreeSpeciesId = (typeof TREE_SPECIES_IDS)[number];

export type TreeSpeciesDef = {
  id: TreeSpeciesId;
  label: string;
  /** Enterprises that commonly use this species. */
  enterprises: FarmEnterpriseId[];
  /**
   * Built-in cultivar/variety names. Walnut list is authoritative for chill;
   * others are starter placeholders until crop packs land.
   */
  cultivars: readonly string[];
};

/** Walnut cultivars — keep names aligned with shared/weather/chillPortions CULTIVARS. */
export const WALNUT_CULTIVARS = [
  'Chandler',
  'Hartley',
  'Payne',
  'Howard',
  'Tulare',
  'Vina',
  'Franquette',
  'Lara',
  'Cisco',
] as const;

export const TREE_SPECIES: readonly TreeSpeciesDef[] = [
  {
    id: 'walnut',
    label: 'Walnut',
    enterprises: ['orchard_tree'],
    cultivars: WALNUT_CULTIVARS,
  },
  {
    id: 'almond',
    label: 'Almond',
    enterprises: ['orchard_tree'],
    cultivars: ['Nonpareil', 'Carmel', 'Monterey', 'Other'],
  },
  {
    id: 'avocado',
    label: 'Avocado',
    enterprises: ['orchard_tree', 'fruit'],
    cultivars: ['Hass', 'Reed', 'Shepard', 'Other'],
  },
  {
    id: 'olive',
    label: 'Olive',
    enterprises: ['orchard_tree'],
    cultivars: ['Frantoio', 'Manzanillo', 'Picual', 'Other'],
  },
  {
    id: 'citrus',
    label: 'Citrus',
    enterprises: ['fruit', 'orchard_tree'],
    cultivars: ['Navel', 'Valencia', 'Mandarin', 'Lemon', 'Other'],
  },
  {
    id: 'apple',
    label: 'Apple',
    enterprises: ['fruit'],
    cultivars: ['Pink Lady', 'Gala', 'Granny Smith', 'Other'],
  },
  {
    id: 'pear',
    label: 'Pear',
    enterprises: ['fruit'],
    cultivars: ['Packham', 'Williams', 'Other'],
  },
  {
    id: 'cherry',
    label: 'Cherry',
    enterprises: ['fruit'],
    cultivars: ['Bing', 'Lapins', 'Other'],
  },
  {
    id: 'grape',
    label: 'Grape',
    enterprises: ['vineyard'],
    cultivars: ['Cabernet Sauvignon', 'Shiraz', 'Chardonnay', 'Sauvignon Blanc', 'Other'],
  },
  {
    id: 'other_tree',
    label: 'Other tree / vine',
    enterprises: ['orchard_tree', 'fruit', 'vineyard'],
    cultivars: ['Other'],
  },
] as const;

/** How map geometry is interpreted for a paddock (skeleton). */
export const GEOMETRY_KIND_IDS = ['boundary', 'water_zone', 'dam'] as const;
export type GeometryKindId = (typeof GEOMETRY_KIND_IDS)[number];

export type FarmProfile = {
  /** One or more enterprises this farm runs (mixed farms are normal). */
  enterprises: FarmEnterpriseId[];
  /**
   * Which enterprise new paddocks default to (and drives map wording when mixed).
   * Must be one of `enterprises`.
   */
  primaryEnterpriseId?: FarmEnterpriseId;
  /**
   * Livestock on this farm — graze / move between paddocks with their own
   * input/output tracking (later). Can overlay any enterprise mix.
   */
  livestockEnabled: boolean;
  /** @deprecated read via resolveFarmProfile — old settings key */
  livestockAsHarvester?: boolean;
  /** Default tree/vine species when drawing orchard paddocks. */
  defaultSpeciesId?: TreeSpeciesId | '';
};

export const DEFAULT_FARM_PROFILE: FarmProfile = {
  enterprises: ['orchard_tree'],
  primaryEnterpriseId: 'orchard_tree',
  livestockEnabled: false,
  defaultSpeciesId: 'walnut',
};

/** Enterprises that use paddock / farm-map language (not “orchard”). */
export const PADDOCK_MAP_ENTERPRISES: readonly FarmEnterpriseId[] = [
  'broadacre',
  'hort_veg',
  'station',
  'aquaculture',
];

export const TREE_MAP_ENTERPRISES: readonly FarmEnterpriseId[] = [
  'orchard_tree',
  'fruit',
  'vineyard',
];

export type MapUiCopy = {
  /** Nav + page title in operate mode */
  mapTitle: string;
  /** Edit-mode title */
  editTitle: string;
  /** Sidebar / tab label for polygons */
  blocksTab: string;
  /** Singular noun */
  blockWord: string;
};

export function isFarmEnterpriseId(value: unknown): value is FarmEnterpriseId {
  return typeof value === 'string' && (FARM_ENTERPRISE_IDS as readonly string[]).includes(value);
}

export function isTreeSpeciesId(value: unknown): value is TreeSpeciesId {
  return typeof value === 'string' && (TREE_SPECIES_IDS as readonly string[]).includes(value);
}

export function getEnterprise(id: FarmEnterpriseId): FarmEnterpriseDef {
  return FARM_ENTERPRISES.find((e) => e.id === id) ?? FARM_ENTERPRISES[0]!;
}

export function getTreeSpecies(id: TreeSpeciesId | string | undefined): TreeSpeciesDef | undefined {
  if (!id) return undefined;
  return TREE_SPECIES.find((s) => s.id === id);
}

/** Normalize farm profile from Firestore / settings (backward compatible). */
export function resolveFarmProfile(input: unknown): FarmProfile {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const enterprises = Array.isArray(raw.enterprises)
    ? raw.enterprises.filter(isFarmEnterpriseId)
    : [];
  const livestockEnabled = Boolean(
    raw.livestockEnabled ?? raw.livestockAsHarvester /* legacy key */
  );
  const defaultSpeciesId = isTreeSpeciesId(raw.defaultSpeciesId) ? raw.defaultSpeciesId : '';
  const requestedPrimary = isFarmEnterpriseId(raw.primaryEnterpriseId)
    ? raw.primaryEnterpriseId
    : undefined;

  if (enterprises.length === 0) {
    // Explicit empty profile (new / non-orchard farms) — do not force walnut.
    return {
      enterprises: [],
      primaryEnterpriseId: undefined,
      livestockEnabled,
      defaultSpeciesId: defaultSpeciesId || '',
    };
  }

  const unique = [...new Set(enterprises)];
  const primaryEnterpriseId =
    requestedPrimary && unique.includes(requestedPrimary)
      ? requestedPrimary
      : unique[0]!;

  return {
    enterprises: unique,
    primaryEnterpriseId,
    livestockEnabled,
    defaultSpeciesId:
      defaultSpeciesId ||
      (unique.includes('orchard_tree') ? 'walnut' : ''),
  };
}

/** Primary enterprise for naming UI when a paddock has no cropKind yet. */
export function primaryEnterprise(profile: FarmProfile): FarmEnterpriseId {
  const resolved = resolveFarmProfile(profile);
  return resolved.primaryEnterpriseId ?? resolved.enterprises[0] ?? 'orchard_tree';
}

/**
 * Walnut crop pack — blight, chill cultivar targets, Ji About/Settings.
 *
 * ON when:
 * - any mapped area has species walnut, or
 * - farm profile is orchard_tree with defaultSpeciesId walnut, or
 * - no farmProfile configured yet but blight is still in the farm module catalog (legacy)
 */
export function farmHasWalnutPack(opts: {
  profile?: unknown;
  blocks?: Array<{ species?: string | null }>;
  /** Farm-level enabledModules includes blight (legacy walnut-first farms). */
  blightModuleEnabled?: boolean;
}): boolean {
  if (
    opts.blocks?.some((b) => String(b.species || '').trim().toLowerCase() === 'walnut')
  ) {
    return true;
  }

  const raw = opts.profile;
  if (raw && typeof raw === 'object' && Array.isArray((raw as { enterprises?: unknown }).enterprises)) {
    const p = resolveFarmProfile(raw);
    if (!p.enterprises.includes('orchard_tree')) return false;
    return p.defaultSpeciesId === 'walnut';
  }

  // Profile never saved — only treat as walnut if blight catalog still enabled.
  return Boolean(opts.blightModuleEnabled);
}

export function isTreeCropKind(cropKind?: FarmEnterpriseId | string | null): boolean {
  return Boolean(cropKind && (TREE_MAP_ENTERPRISES as readonly string[]).includes(cropKind));
}

/**
 * Eligibility for the chill portions pack (orchard / fruit / vineyard).
 *
 * Also ON when the walnut crop pack is active, and for legacy blocks that only
 * have `species` set. After `chill_portions` is on the farm, UI should follow
 * pack active — this helper is for Install hints and legacy migration.
 */
export function farmShowsChillPortions(opts: {
  profile?: unknown;
  blocks?: Array<{ cropKind?: FarmEnterpriseId | string | null; species?: string | null }>;
  /** Active walnut_blight pack (legacy farms treated chill as part of that pack). */
  walnutPackActive?: boolean;
  /** Active chill_portions pack. */
  chillPackActive?: boolean;
}): boolean {
  if (opts.chillPackActive) return true;
  if (opts.walnutPackActive) return true;
  const p = resolveFarmProfile(opts.profile);
  if (p.enterprises.some((id) => isTreeCropKind(id))) return true;
  if (opts.blocks?.some((b) => isTreeCropKind(b.cropKind))) return true;
  if (opts.blocks?.some((b) => Boolean(String(b.species || '').trim()))) return true;
  return false;
}

export function isPaddockLandKind(cropKind?: FarmEnterpriseId | string | null): boolean {
  return Boolean(cropKind && (PADDOCK_MAP_ENTERPRISES as readonly string[]).includes(cropKind));
}

/** Per-polygon wording — orchard blocks vs broadacre/grazing paddocks. */
export function areaWordForCropKind(cropKind?: FarmEnterpriseId | string | null): string {
  if (isTreeCropKind(cropKind)) return 'Block';
  if (isPaddockLandKind(cropKind)) return 'Paddock';
  return 'Area';
}

/** Nav / map titles — mixed farms stay neutral so orchard + broadacre wording don’t clash. */
export function mapUiCopy(profile: FarmProfile | unknown): MapUiCopy {
  const p = resolveFarmProfile(profile);
  const anyPaddockLand = p.enterprises.some((id) => isPaddockLandKind(id));
  const anyTree = p.enterprises.some((id) => isTreeCropKind(id));

  if (anyTree && anyPaddockLand) {
    return {
      mapTitle: 'Farm Map',
      editTitle: 'Edit areas',
      blocksTab: 'Areas',
      blockWord: 'area',
    };
  }
  if (anyTree && !anyPaddockLand) {
    return {
      mapTitle: 'Orchard Map',
      editTitle: 'Edit blocks',
      blocksTab: 'Blocks',
      blockWord: 'block',
    };
  }
  return {
    mapTitle: 'Paddock Map',
    editTitle: 'Edit paddocks',
    blocksTab: 'Paddocks',
    blockWord: 'paddock',
  };
}

export function speciesForEnterprise(enterpriseId: FarmEnterpriseId): TreeSpeciesDef[] {
  return TREE_SPECIES.filter((s) => s.enterprises.includes(enterpriseId));
}

export function cultivarsForSpecies(speciesId: TreeSpeciesId | string | undefined): string[] {
  const sp = getTreeSpecies(speciesId);
  return sp ? [...sp.cultivars] : [];
}

export function defaultGeometryKind(enterpriseId: FarmEnterpriseId): GeometryKindId {
  const model = getEnterprise(enterpriseId).paddockModel;
  if (model === 'water_zone') return 'water_zone';
  if (model === 'dam') return 'dam';
  return 'boundary';
}
