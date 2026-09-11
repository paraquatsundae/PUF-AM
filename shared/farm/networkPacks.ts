/**
 * Network-pack state on a cloud farm's Firestore doc — `farms/{farmId}.networkPacks`.
 *
 * A Freenet-native farm keeps its enable flag in `localStorage`
 * (`plugins/freenet_host/src/freenetHostEnable.ts`) because it has no farm doc.
 * A **hybrid** farm — a Firestore farm whose sealed mirror and join plane sit on
 * Freenet — keeps it here so every member device reads the same answer through
 * the farm-doc listener `AuthContext` already holds. Nothing in this map is a
 * secret: `mistFarmId` is the Freenet address family derived from the FarmCode,
 * never the FarmCode or the FarmSeed themselves.
 *
 * @see Plans/FREENET_NETWORK_PACK.md §3
 * @see Plans/NAMING.md §8
 */

export const FREENET_HOST_NETWORK_PACK_ID = 'freenet_host' as const;

export type NetworkPackId = typeof FREENET_HOST_NETWORK_PACK_ID;

export type FreenetHostFarmDocState = {
  enabled: boolean;
  /**
   * The mist FarmId (`deriveFarmId(FarmSeed)`) this farm's mirror is addressed
   * under. Kept when `enabled` flips to false so re-enabling keeps the same mirror
   * and every device that already holds the FarmCode still lines up.
   */
  mistFarmId: string;
  /** ISO timestamp of the last enable/disable. */
  changedAt: string;
  /** Firebase uid of the owner/admin who flipped it. */
  changedBy: string;
};

export type FarmNetworkPacksMap = Partial<Record<NetworkPackId, FreenetHostFarmDocState>>;

const MAX_ID_LEN = 128;

function cleanString(value: unknown, max = MAX_ID_LEN): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Read the map off a raw farm doc. Anything malformed resolves to "absent" rather
 * than throwing — the farm doc is written by every version of the app that ever
 * touched it, and a bad entry here must not take the whole farm down.
 */
export function resolveFarmNetworkPacks(raw: unknown): FarmNetworkPacksMap {
  if (!raw || typeof raw !== 'object') return {};
  const entry = (raw as Record<string, unknown>)[FREENET_HOST_NETWORK_PACK_ID];
  if (!entry || typeof entry !== 'object') return {};
  const o = entry as Record<string, unknown>;
  const mistFarmId = cleanString(o.mistFarmId);
  if (!mistFarmId) return {};
  return {
    [FREENET_HOST_NETWORK_PACK_ID]: {
      enabled: o.enabled === true,
      mistFarmId,
      changedAt: cleanString(o.changedAt, 64),
      changedBy: cleanString(o.changedBy),
    },
  };
}

export function farmFreenetHostState(
  packs: FarmNetworkPacksMap | null | undefined,
): FreenetHostFarmDocState | null {
  return packs?.[FREENET_HOST_NETWORK_PACK_ID] ?? null;
}

/** True when the farm doc says the Freenet mirror is on for this farm. */
export function isFarmFreenetHostEnabled(packs: FarmNetworkPacksMap | null | undefined): boolean {
  return farmFreenetHostState(packs)?.enabled === true;
}

export type FreenetHostFarmDocUpdateInput = {
  enabled: boolean;
  /**
   * Required on enable. On disable the stored id is kept when none is given, so
   * turning the mirror off never forgets where it was.
   */
  mistFarmId?: string;
  current?: FreenetHostFarmDocState | null;
  changedBy: string;
  now?: Date;
};

/**
 * The single farm-doc write a hybrid enable or disable makes, as a dotted-path
 * patch for `updateDoc` — it touches `networkPacks.freenet_host` only, so nothing
 * else on the doc (and no other network pack) is rewritten.
 *
 * Pure so it can be tested without Firestore; the caller hands the patch to
 * `updateDoc(doc(db, 'farms', farmId), patch)`.
 */
export function planFreenetHostFarmDocUpdate(
  input: FreenetHostFarmDocUpdateInput,
): Record<string, FreenetHostFarmDocState> {
  const mistFarmId = cleanString(input.mistFarmId) || input.current?.mistFarmId?.trim() || '';
  if (!mistFarmId) {
    throw new Error('A hybrid farm needs its mist FarmId before the mirror can be switched.');
  }
  const changedBy = cleanString(input.changedBy);
  if (!changedBy) throw new Error('changedBy must be the signed-in uid.');
  return {
    [`networkPacks.${FREENET_HOST_NETWORK_PACK_ID}`]: {
      enabled: input.enabled,
      mistFarmId,
      changedAt: (input.now ?? new Date()).toISOString(),
      changedBy,
    },
  };
}
