/**
 * What a join ticket grants — presets on the wire, modules on arrival.
 *
 * A Freenet ticket used to carry a bare `JoinRole`, and four of the owner's five
 * crew choices collapse onto `farmer`. So "Crop scout" and "Field only" were the
 * same ticket, and the joiner was handed every module regardless — a scout
 * joined with the financials tab open. The role stays on the wire as the write
 * ceiling; the *preset* rides alongside it in `JoinManifestV2.permissions`,
 * which `parseJoinManifestV2` already validates and round-trips, so this needs
 * no v3 manifest.
 *
 * The presets are the cloud invite-PIN presets (`MODULE_PRESETS`), not a second
 * vocabulary: an owner who has issued a PIN should recognise every word here.
 * `owner` is the one addition — it means *another of your own devices* and has
 * no cloud equivalent because there is no cloud account to hold it.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §3b
 */

import {
  MODULE_PRESETS,
  allFarmModules,
  presetsForFarm,
  sanitizeModules,
  type FarmModuleId,
  type ModulePreset,
  type ModulePresetId,
  type PresetsForFarmOptions,
} from '../auth/farmModules.ts';
import { coerceJoinRole, type JoinRole } from './joinTicket.ts';

/** Cloud presets plus `owner`, which only a Freenet farm can grant. */
export type JoinPresetId = ModulePresetId | 'owner';

export type JoinPreset = {
  id: JoinPresetId;
  label: string;
  /** Write ceiling carried in `JoinManifestV2.role`. */
  role: JoinRole;
  modules: FarmModuleId[];
  blurb: string;
};

/** Keys written into `permissions`. Anything else there is ignored on arrival. */
export const JOIN_PERMISSION_PRESET_KEY = 'preset';
export const JOIN_PERMISSION_MODULES_KEY = 'modules';

const OWNER_PRESET: JoinPreset = {
  id: 'owner',
  label: 'Owner (another of your own devices)',
  role: 'owner',
  modules: allFarmModules(),
  blurb: 'Everything, including farm setup',
};

/**
 * Settings is not in `WORK_MODULES`, and on a cloud farm that is fine — a member
 * locked out of it still has an admin with a browser and a Firestore console.
 *
 * A Freenet farm has neither. Settings is where that device's unlock PIN,
 * Wi‑Fi sync and "join a farm" live, so a joiner without it cannot re-pull the
 * farm after the owner re-sends, and nobody can do it for them. It also grants
 * nothing: the device already holds the FarmSeed, so anyone at its keyboard can
 * re-share the farm with or without a nav entry (§3, the honest limit).
 */
const JOIN_FLOOR_MODULES: FarmModuleId[] = ['dashboard', 'settings'];

/**
 * Exported because the floor has to hold on every read of a grant, not just on
 * the one that arrives with a ticket. A session sealed before §3b replays its
 * grant from the stored meta on each launch (`getMistSessionGrant`), and
 * without the floor there it comes back a module short forever.
 */
export function withJoinFloor(modules: FarmModuleId[]): FarmModuleId[] {
  return sanitizeModules([...JOIN_FLOOR_MODULES, ...modules]);
}

function fromModulePreset(preset: ModulePreset): JoinPreset {
  return {
    id: preset.id,
    label: preset.label,
    // `FarmRole` is a subset of `JoinRole`, so the ceiling travels unchanged.
    role: preset.role,
    modules: preset.modules,
    blurb: preset.blurb,
  };
}

/** Every preset a Freenet ticket may carry, owner first — it is the common case. */
export function joinPresets(): JoinPreset[] {
  return [OWNER_PRESET, ...MODULE_PRESETS.map(fromModulePreset)];
}

/**
 * Presets narrowed to what this farm actually offers, so an owner is never
 * offered a Crop scout ticket for blight on a farm with no walnut pack. Same
 * filter the invite-PIN screen uses.
 *
 * The owner preset is narrowed too. Its `admin` ceiling means the module list
 * is moot for access, but the send card prints it, and promising blight tools
 * to a farm that has none is a lie on screen.
 */
export function joinPresetsForFarm(
  farmEnabled: unknown,
  options?: PresetsForFarmOptions,
): JoinPreset[] {
  const ban = new Set(options?.excludeModules ?? []);
  const owner: JoinPreset = {
    ...OWNER_PRESET,
    modules: OWNER_PRESET.modules.filter((id) => !ban.has(id)),
  };
  return [owner, ...presetsForFarm(farmEnabled, options).map(fromModulePreset)];
}

export function isJoinPresetId(value: unknown): value is JoinPresetId {
  return typeof value === 'string' && joinPresets().some((preset) => preset.id === value);
}

export function findJoinPreset(id: unknown): JoinPreset | null {
  return joinPresets().find((preset) => preset.id === id) ?? null;
}

/** What a ticket grants when it names a role and nothing else — see `readJoinGrant`. */
export function modulesForJoinRole(role: JoinRole): FarmModuleId[] {
  if (role === 'owner' || role === 'admin') return allFarmModules();
  const preset = findJoinPreset(role === 'viewer' ? 'viewer' : 'full_farmer');
  return preset ? preset.modules : allFarmModules();
}

/**
 * The `permissions` bag for a ticket. Values may only be boolean, number or
 * string (`sanitizePermissions` drops the rest), so the module list travels as
 * a comma-joined string and is re-`sanitizeModules()`d on arrival.
 */
export function buildJoinPermissions(
  preset: JoinPreset,
): Record<string, boolean | number | string> {
  return {
    [JOIN_PERMISSION_PRESET_KEY]: preset.id,
    [JOIN_PERMISSION_MODULES_KEY]: preset.modules.join(','),
  };
}

export type JoinGrant = {
  /** Absent on a ticket minted before presets existed. */
  preset?: JoinPresetId;
  role: JoinRole;
  modules: FarmModuleId[];
  /** True when the modules came from the ticket rather than from role defaults. */
  fromPermissions: boolean;
};

function parseModuleList(value: unknown): FarmModuleId[] {
  if (typeof value === 'string') return sanitizeModules(value.split(','));
  return sanitizeModules(value);
}

/**
 * Read a manifest's grant, tolerating every ticket ever minted.
 *
 * Precedence is deliberate: an explicit module list wins, then the preset it
 * names, then the role's defaults. A ticket from before this existed carries
 * only a role and still resolves to a sensible grant, which is what keeps live
 * tickets working across the upgrade.
 */
export function readJoinGrant(manifest: {
  role?: unknown;
  permissions?: Record<string, boolean | number | string> | undefined;
}): JoinGrant {
  const role = coerceJoinRole(manifest.role);
  const permissions = manifest.permissions ?? {};

  const presetId = isJoinPresetId(permissions[JOIN_PERMISSION_PRESET_KEY])
    ? (permissions[JOIN_PERMISSION_PRESET_KEY] as JoinPresetId)
    : undefined;

  const listed = parseModuleList(permissions[JOIN_PERMISSION_MODULES_KEY]);
  const preset = presetId ? findJoinPreset(presetId) : null;
  const granted = listed.length ? listed : preset ? preset.modules : [];

  return {
    ...(presetId ? { preset: presetId } : {}),
    role,
    modules: withJoinFloor(granted.length ? granted : modulesForJoinRole(role)),
    fromPermissions: granted.length > 0,
  };
}
