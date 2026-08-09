/**
 * Mist device session — local-only; not Firebase Auth.
 *
 * - FarmSeed is AES-GCM encrypted at rest (never plaintext in localStorage).
 * - With device PIN: key derived via PBKDF2(pin, salt).
 * - Without PIN (workshop skip): wrapped with a random device key — weaker, auto-unlock on reload.
 */

import { bytesToHex, hexToBytes } from '../../units/mist-freenet/src/index.ts';
import { getSubtleCrypto } from '../../units/mist-freenet/src/subtle-crypto.ts';
import { DEFAULT_JOIN_ROLE, coerceJoinRole, type JoinRole } from '../../shared/sync/joinTicket.ts';
import {
  modulesForJoinRole,
  withJoinFloor,
  type JoinGrant,
  type JoinPresetId,
} from '../../shared/sync/joinGrant.ts';
import { sanitizeModules, type FarmModuleId } from '../../shared/auth/farmModules.ts';
import { forgetUnlockedFarmSeed, rememberUnlockedFarmSeed } from './mistFarmSeedCache.ts';

/**
 * Authority label, not a crypto boundary. Anyone holding the FarmCode can
 * decrypt this farm — the role decides what the app puts in front of them (the
 * owner's geometry wizard, the crew's diary), and the join manifest's
 * `permissions` bag now says which modules come with it.
 */
export type MistSessionRole = JoinRole;

export type MistDeviceSession = {
  uid: string;
  farmId: string;
  farmName: string;
  displayName: string;
  role: MistSessionRole;
  createdAt: string;
  /** Hex-encoded 32-byte FarmSeed — only in memory after decrypt; encrypted on disk. */
  farmSeedHex: string;
  hasDevicePin: boolean;
  /** True when this device came in on a join ticket rather than minting the farm. */
  joinedViaTicket?: boolean;
};

/**
 * Non-secret metadata for the unlock and join gates (no FarmSeed).
 *
 * The join flags live here rather than in the encrypted blob because they change
 * *after* unlock, when no device PIN is in hand to re-seal it. Nothing here is
 * sensitive: a role name and whether this device is still waiting for a ticket.
 */
export type MistSessionMeta = {
  farmId: string;
  farmName: string;
  displayName: string;
  hasDevicePin: boolean;
  role?: MistSessionRole;
  /** Preset the accepted ticket named — "Field only", "Crop scout". */
  preset?: JoinPresetId;
  /** Modules that ticket granted. Absent on a session from before presets. */
  modules?: FarmModuleId[];
  joinedViaTicket?: boolean;
  /** Blocks the app on "Enter join ticket" until the farm data actually arrives. */
  joinTicketPending?: boolean;
  /** Operator chose to look around before joining — gate steps aside, sync card still nags. */
  joinTicketDeferred?: boolean;
};

const SESSION_BLOB_KEY = 'pufam.mist.session.v1';
const SESSION_META_KEY = 'pufam.mist.sessionMeta.v1';
const DEVICE_KEY_KEY = 'pufam.mist.deviceKey';

function ls(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return bytesToHex(arr);
}

async function deriveAesKeyFromPin(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  const enc = new TextEncoder();
  const keyMaterial = await subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 120_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function deriveAesKeyFromDeviceKey(deviceKeyHex: string): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  const raw = hexToBytes(deviceKeyHex);
  return subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

type EncryptedBlob = {
  v: 1;
  mode: 'pin' | 'device';
  salt?: string;
  iv: string;
  ct: string;
};

async function encryptSession(session: MistDeviceSession, pin?: string): Promise<EncryptedBlob> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const plaintext = new TextEncoder().encode(JSON.stringify(session));

  let key: CryptoKey;
  let mode: EncryptedBlob['mode'];
  let saltHex: string | undefined;

  if (pin && pin.replace(/\D/g, '').length >= 4) {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    saltHex = bytesToHex(salt);
    key = await deriveAesKeyFromPin(pin.replace(/\D/g, ''), salt);
    mode = 'pin';
  } else {
    let deviceKeyHex = ls()?.getItem(DEVICE_KEY_KEY);
    if (!deviceKeyHex) {
      deviceKeyHex = randomHex(32);
      ls()?.setItem(DEVICE_KEY_KEY, deviceKeyHex);
    }
    key = await deriveAesKeyFromDeviceKey(deviceKeyHex);
    mode = 'device';
  }

  const ct = await getSubtleCrypto().encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    v: 1,
    mode,
    ...(saltHex ? { salt: saltHex } : {}),
    iv: bytesToHex(iv),
    ct: bytesToHex(new Uint8Array(ct)),
  };
}

async function decryptSession(blob: EncryptedBlob, pin?: string): Promise<MistDeviceSession> {
  const iv = hexToBytes(blob.iv);
  const ct = hexToBytes(blob.ct);

  let key: CryptoKey;
  if (blob.mode === 'pin') {
    if (!pin || !blob.salt) throw new Error('Device PIN required');
    key = await deriveAesKeyFromPin(pin.replace(/\D/g, ''), hexToBytes(blob.salt));
  } else {
    const deviceKeyHex = ls()?.getItem(DEVICE_KEY_KEY);
    if (!deviceKeyHex) throw new Error('Device key missing — sign in again with FarmCode');
    key = await deriveAesKeyFromDeviceKey(deviceKeyHex);
  }

  const plain = await getSubtleCrypto().decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(plain)) as MistDeviceSession;
}

export async function saveMistDeviceSession(
  session: MistDeviceSession,
  devicePin?: string,
  joinState?: { joinTicketPending?: boolean },
): Promise<void> {
  const blob = await encryptSession(session, devicePin);
  ls()?.setItem(SESSION_BLOB_KEY, JSON.stringify(blob));
  saveMistSessionMeta({
    farmId: session.farmId,
    farmName: session.farmName,
    displayName: session.displayName,
    hasDevicePin: session.hasDevicePin,
    role: session.role,
    joinedViaTicket: session.joinedViaTicket,
    joinTicketPending: joinState?.joinTicketPending,
  });
}

export function saveMistSessionMeta(meta: MistSessionMeta): void {
  ls()?.setItem(SESSION_META_KEY, JSON.stringify(meta));
}

export function getMistSessionMeta(): MistSessionMeta | null {
  const raw = ls()?.getItem(SESSION_META_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MistSessionMeta;
  } catch {
    return null;
  }
}

export function hasMistDeviceSession(): boolean {
  return Boolean(ls()?.getItem(SESSION_BLOB_KEY));
}

/**
 * The one place a sealed session becomes an open one.
 *
 * Handing the seed to the in-memory cache here rather than at each call site is
 * what stops "unlocked on screen, locked underneath": the PIN gate, boot
 * restore, FarmCode recovery and a join all come through this function, and a
 * publish from any of them now finds a seed already in hand. Before this, only
 * a caller that happened to pass the PIN again could send a farm.
 */
export async function loadMistDeviceSession(devicePin?: string): Promise<MistDeviceSession | null> {
  const raw = ls()?.getItem(SESSION_BLOB_KEY);
  if (!raw) return null;
  try {
    const blob = JSON.parse(raw) as EncryptedBlob;
    const session = await decryptSession(blob, devicePin);
    rememberUnlockedFarmSeed(session.farmSeedHex);
    return session;
  } catch (err) {
    console.warn('[mist] session decrypt failed:', err);
    return null;
  }
}

export function clearMistDeviceSession(): void {
  ls()?.removeItem(SESSION_BLOB_KEY);
  ls()?.removeItem(SESSION_META_KEY);
  ls()?.removeItem(DEVICE_KEY_KEY);
  forgetUnlockedFarmSeed();
}

/**
 * How this device will reopen the farm at the next launch.
 *
 * The whole point of persisting the session is that a returning operator is
 * asked for a **device PIN** at worst — never a FarmCode, never a join ticket.
 * `none` is the workshop skip: the blob is still AES-GCM sealed, but under a
 * random key sitting beside it in `localStorage`, so anyone who can open this
 * machine's user account can open the farm. That is a trade the operator made
 * (or, more often, never noticed), which is why the Settings card names it.
 */
export type MistUnlockMode = 'pin' | 'none' | 'absent';

export function mistUnlockMode(): MistUnlockMode {
  const raw = ls()?.getItem(SESSION_BLOB_KEY);
  if (!raw) return 'absent';
  try {
    return (JSON.parse(raw) as EncryptedBlob).mode === 'pin' ? 'pin' : 'none';
  } catch {
    return 'absent';
  }
}

/**
 * Re-seal this device's session under a new PIN, or under the device key when
 * `nextPin` is empty.
 *
 * First-run is the only place a PIN could be chosen before this, and the
 * checkbox there defaults to skipping it — so an operator who wanted one later
 * had no way to add it, and one who set a PIN on a shared shed laptop had no
 * way to change it. Both are answered by decrypting with what the blob is
 * sealed under now and encrypting with what it should be sealed under next.
 *
 * The FarmSeed never leaves this function in the clear: it is read out of the
 * existing blob and written straight back into a new one. A wrong current PIN
 * fails the decrypt and returns `false`, leaving the stored session untouched.
 */
export async function changeMistDevicePin(input: {
  currentPin?: string;
  nextPin?: string;
}): Promise<boolean> {
  const session = await loadMistDeviceSession(input.currentPin);
  if (!session) return false;

  const nextPin = input.nextPin?.replace(/\D/g, '') ?? '';
  const hasDevicePin = nextPin.length >= 4;
  if (nextPin.length > 0 && !hasDevicePin) return false;

  // The device key is what a PIN-less session is sealed under. Dropping it when
  // a PIN takes over means a stolen `localStorage` no longer carries a usable
  // key beside the ciphertext.
  const meta = getMistSessionMeta();
  await saveMistDeviceSession(
    { ...session, hasDevicePin },
    hasDevicePin ? nextPin : undefined,
    { joinTicketPending: meta?.joinTicketPending },
  );
  if (hasDevicePin) ls()?.removeItem(DEVICE_KEY_KEY);

  // `saveMistDeviceSession` writes a fresh meta from the session, which knows
  // nothing about a grant that arrived after unlock — put the join record back.
  if (meta) {
    saveMistSessionMeta({
      ...meta,
      hasDevicePin,
    });
  }
  return true;
}

export function mistSessionNeedsPin(): boolean {
  const raw = ls()?.getItem(SESSION_BLOB_KEY);
  if (!raw) return false;
  try {
    const blob = JSON.parse(raw) as EncryptedBlob;
    return blob.mode === 'pin';
  } catch {
    return false;
  }
}

export function createMistSessionRecord(input: {
  farmId: string;
  farmName: string;
  displayName: string;
  farmSeed: Uint8Array;
  devicePin?: string;
  role?: MistSessionRole;
  joinedViaTicket?: boolean;
}): MistDeviceSession {
  return {
    uid: `mist_${input.farmId.slice(0, 16)}`,
    farmId: input.farmId,
    farmName: input.farmName,
    displayName: input.displayName,
    role: input.role ? coerceJoinRole(input.role) : DEFAULT_JOIN_ROLE,
    createdAt: new Date().toISOString(),
    farmSeedHex: bytesToHex(input.farmSeed),
    hasDevicePin: Boolean(input.devicePin && input.devicePin.replace(/\D/g, '').length >= 4),
    ...(input.joinedViaTicket ? { joinedViaTicket: true } : {}),
  };
}

export type MistJoinState = {
  role: MistSessionRole;
  preset?: JoinPresetId;
  joinedViaTicket: boolean;
  joinTicketPending: boolean;
  joinTicketDeferred: boolean;
};

/**
 * Sessions written before join tickets existed carry `role: 'admin'` and no join
 * flags — those devices minted or recovered their own farm, so nothing is
 * pending for them.
 */
export function getMistJoinState(): MistJoinState | null {
  const meta = getMistSessionMeta();
  if (!meta) return null;
  return {
    role: coerceJoinRole(meta.role ?? 'admin'),
    ...(meta.preset ? { preset: meta.preset } : {}),
    joinedViaTicket: Boolean(meta.joinedViaTicket),
    joinTicketPending: Boolean(meta.joinTicketPending),
    joinTicketDeferred: Boolean(meta.joinTicketDeferred),
  };
}

/**
 * What this device was actually granted, or `null` when there is no session.
 *
 * Sessions written before presets carry a role and no module list, so the
 * role's defaults stand in — the same fallback `readJoinGrant` applies to a
 * ticket minted before §3b. A session with no role at all predates join tickets
 * entirely: that device minted or recovered its own farm, so it is an admin.
 *
 * The join floor is re-applied here rather than trusted from the meta. A device
 * that joined before §3b holds `role: 'farmer'` and no module list, so it
 * rebuilds `WORK_MODULES` on every launch — no `settings`, which is where its
 * unlock PIN, Wi‑Fi sync and re-join live. Re-applying costs nothing for a
 * session written after §3b, whose stored list already carries the floor.
 */
export function getMistSessionGrant(): JoinGrant | null {
  const meta = getMistSessionMeta();
  if (!meta) return null;
  const role = coerceJoinRole(meta.role ?? 'admin');
  const stored = sanitizeModules(meta.modules);
  return {
    ...(meta.preset ? { preset: meta.preset } : {}),
    role,
    modules: withJoinFloor(stored.length ? stored : modulesForJoinRole(role)),
    fromPermissions: stored.length > 0,
  };
}

/**
 * Ticket resolved and the farm landed — clear the gate and record what it
 * granted.
 *
 * The grant is written to the *meta* rather than the encrypted session blob
 * because it arrives after unlock, when no device PIN is in hand to re-seal the
 * blob. Nothing here is sensitive: a preset name and a list of nav entries.
 */
export function markMistJoinTicketAccepted(grant: JoinGrant): void {
  const meta = getMistSessionMeta();
  if (!meta) return;
  saveMistSessionMeta({
    ...meta,
    role: coerceJoinRole(grant.role),
    ...(grant.preset ? { preset: grant.preset } : {}),
    modules: sanitizeModules(grant.modules),
    joinedViaTicket: true,
    joinTicketPending: false,
    joinTicketDeferred: false,
  });
}

/** Operator wants in without the farm data yet (offline basemap, look around). */
export function deferMistJoinTicket(): void {
  const meta = getMistSessionMeta();
  if (!meta) return;
  saveMistSessionMeta({ ...meta, joinTicketPending: false, joinTicketDeferred: true });
}
