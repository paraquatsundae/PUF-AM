/**
 * Farm module IDs — nav areas a member may access.
 * Role remains the write ceiling (admin/farmer write; viewer read-only).
 */
export const FARM_MODULE_IDS = [
  'dashboard',
  'map',
  'diary',
  'blight',
  'chill',
  'water',
  'nutrition',
  'harvest',
  'drying',
  'financials',
  'farm_management',
  'farm_setup',
  'settings',
] as const;

export type FarmModuleId = (typeof FARM_MODULE_IDS)[number];

export type FarmRole = 'admin' | 'farmer' | 'viewer';

export const MODULE_LABELS: Record<FarmModuleId, string> = {
  dashboard: 'Dashboard',
  map: 'Farm Map',
  diary: 'Farm Diary',
  blight: 'Blight Risk',
  chill: 'Chill portions',
  water: 'Water',
  nutrition: 'Nutrition',
  harvest: 'Harvest',
  drying: 'Drying',
  financials: 'Financials',
  farm_management: 'Farm Management',
  farm_setup: 'Farm Setup',
  settings: 'Settings',
};

/**
 * Pack-owned modules (blight, chill, …) live on `CROP_PACKS` in
 * `shared/farm/cropPacks.ts` (`allPackModuleIds`, `defaultModulesWithoutCropPacks`).
 * Do not add a second owner list here.
 */

/** Always available for a farm (shell + team). Not toggleable off. */
export const ALWAYS_ON_MODULES: FarmModuleId[] = [
  'dashboard',
  'farm_management',
  'farm_setup',
  'settings',
];

/** Crop / ops modules the owner can turn on or off for the whole farm. */
export const OPTIONAL_MODULES: FarmModuleId[] = FARM_MODULE_IDS.filter(
  (id) => !ALWAYS_ON_MODULES.includes(id)
);

export const MODULE_BLURBS: Record<FarmModuleId, string> = {
  dashboard: 'Home snapshot',
  map: 'Areas, pins, field issues',
  diary: 'Spray, water, nutrition, work plans',
  blight: 'Walnut blight risk (walnut crop pack only)',
  chill: 'Dynamic Model chill portions (chill pack)',
  water: 'Irrigation logging & budget (water pack)',
  nutrition: 'Fertiliser diary (nutrition pack)',
  harvest: 'Yield by block (harvest pack)',
  drying: 'Dryer list and moisture sessions (drying pack)',
  financials: 'Costs & records',
  farm_management: 'Team, PINs, discovery',
  farm_setup: 'Farm type, people, map highlights',
  settings: 'Account & farm preferences',
};

/** Modules typical field workers need (excludes team / setup / financials). */
export const WORK_MODULES: FarmModuleId[] = [
  'dashboard',
  'map',
  'diary',
  'blight',
  'chill',
  'water',
  'nutrition',
  'harvest',
  'drying',
];

export const FIELD_ONLY_MODULES: FarmModuleId[] = ['dashboard', 'map', 'diary'];

export const CROP_SCOUT_MODULES: FarmModuleId[] = [
  'dashboard',
  'blight',
  'chill',
  'water',
  'nutrition',
  'drying',
];

export const RECORDS_MODULES: FarmModuleId[] = [
  'dashboard',
  'harvest',
  'financials',
];

export function allFarmModules(): FarmModuleId[] {
  return [...FARM_MODULE_IDS];
}

export function isFarmModuleId(value: string): value is FarmModuleId {
  return (FARM_MODULE_IDS as readonly string[]).includes(value);
}

/** Normalize + dedupe; unknown ids dropped. Empty input → []. */
export function sanitizeModules(input: unknown): FarmModuleId[] {
  if (!Array.isArray(input)) return [];
  const out: FarmModuleId[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (!isFarmModuleId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Farm-level catalog. Missing/empty → all modules (backward compatible).
 * Always-on modules are forced in.
 */
export function resolveFarmEnabledModules(input: unknown): FarmModuleId[] {
  const cleaned = sanitizeModules(input);
  const base = cleaned.length > 0 ? cleaned : allFarmModules();
  const set = new Set<FarmModuleId>([...ALWAYS_ON_MODULES, ...base]);
  return FARM_MODULE_IDS.filter((id) => set.has(id));
}

/** Keep only modules that appear in the allow-list. */
export function clampModulesToFarm(
  modules: unknown,
  farmEnabled: unknown
): FarmModuleId[] {
  const farm = new Set(resolveFarmEnabledModules(farmEnabled));
  return sanitizeModules(modules).filter((m) => farm.has(m));
}

/**
 * What a user can open in the nav.
 * Admin → all farm-enabled modules.
 * Others → intersection of their grant and farm-enabled (default dashboard).
 */
export function effectiveModules(
  role: FarmRole | string | undefined,
  modules: unknown,
  farmEnabled?: unknown
): FarmModuleId[] {
  const farm = resolveFarmEnabledModules(farmEnabled);
  if (role === 'admin') return farm;
  const cleaned = sanitizeModules(modules);
  const base = cleaned.length > 0 ? cleaned : (['dashboard'] as FarmModuleId[]);
  return base.filter((m) => farm.includes(m));
}

export function hasModuleAccess(
  role: FarmRole | string | undefined,
  modules: unknown,
  moduleId: FarmModuleId,
  farmEnabled?: unknown
): boolean {
  return effectiveModules(role, modules, farmEnabled).includes(moduleId);
}

export function canWriteFarmData(role: FarmRole | string | undefined): boolean {
  return role === 'admin' || role === 'farmer';
}

export type ModulePresetId =
  | 'full_farmer'
  | 'field_only'
  | 'crop_scout'
  | 'records'
  | 'viewer'
  | 'admin';

export type ModulePreset = {
  id: ModulePresetId;
  label: string;
  role: FarmRole;
  modules: FarmModuleId[];
  blurb: string;
  pinLabel: string;
  days: number | null;
  maxUses: number | null;
};

export const MODULE_PRESETS: ModulePreset[] = [
  {
    id: 'full_farmer',
    label: 'Full farmer',
    role: 'farmer',
    modules: WORK_MODULES,
    blurb: 'Map, diary, crop tools, harvest',
    pinLabel: 'Season worker',
    days: 365,
    maxUses: null,
  },
  {
    id: 'field_only',
    label: 'Field only',
    role: 'farmer',
    modules: FIELD_ONLY_MODULES,
    blurb: 'Map + diary',
    pinLabel: 'Field worker',
    days: 365,
    maxUses: null,
  },
  {
    id: 'crop_scout',
    label: 'Crop scout',
    role: 'farmer',
    modules: CROP_SCOUT_MODULES,
    blurb: 'Blight (walnut pack), water, nutrition',
    pinLabel: 'Crop scout',
    days: 365,
    maxUses: null,
  },
  {
    id: 'records',
    label: 'Records',
    role: 'farmer',
    modules: RECORDS_MODULES,
    blurb: 'Harvest + financials',
    pinLabel: 'Records',
    days: 365,
    maxUses: null,
  },
  {
    id: 'viewer',
    label: 'Viewer',
    role: 'viewer',
    modules: WORK_MODULES,
    blurb: 'Read-only on work modules',
    pinLabel: 'Viewer',
    days: 365,
    maxUses: null,
  },
  {
    id: 'admin',
    label: 'Admin',
    role: 'admin',
    modules: allFarmModules(),
    blurb: 'Full access + team / PINs',
    pinLabel: 'Farm admin',
    days: 365,
    // Left uncapped on purpose: redeem doubles as return login, so a cap would
    // lock the admin out. Exclusivity comes from binding the code to its first
    // redeemer — see `checkInviteClaim` in shared/auth/inviteLimits.
    maxUses: null,
  },
];

export type PresetsForFarmOptions = {
  /** Drop these modules even if still listed on the farm catalog (e.g. blight without walnut pack). */
  excludeModules?: readonly FarmModuleId[];
};

/** Filter PIN presets to modules the farm actually offers. */
export function presetsForFarm(
  farmEnabled: unknown,
  options?: PresetsForFarmOptions
): ModulePreset[] {
  const ban = new Set(options?.excludeModules ?? []);
  const farm = new Set(
    resolveFarmEnabledModules(farmEnabled).filter((m) => !ban.has(m))
  );
  return MODULE_PRESETS.map((preset) => {
    const modules = preset.modules.filter((m) => farm.has(m));
    let blurb = preset.blurb;
    if (preset.id === 'crop_scout' && !modules.includes('blight')) {
      blurb =
        modules.includes('water') || modules.includes('nutrition')
          ? 'Water and nutrition'
          : 'Crop tools available on this farm';
    }
    if (
      (preset.id === 'full_farmer' || preset.id === 'viewer') &&
      !modules.includes('blight')
    ) {
      blurb =
        preset.id === 'viewer'
          ? 'Read-only on work modules (no walnut pack tools)'
          : 'Map, diary, ops tools, harvest';
    }
    return { ...preset, modules, blurb };
  }).filter((preset) => preset.role === 'admin' || preset.modules.length > 0);
}
