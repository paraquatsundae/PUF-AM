/**
 * Mist device session — local-only; not Firebase Auth.
 *
 * - FarmSeed is AES-GCM encrypted at rest (never plaintext in localStorage).
 * - With device PIN: key derived via PBKDF2(pin, salt).
 * - Without PIN (workshop skip): wrapped with a random device key — weaker, auto-unlock on reload.
 */

import { bytesToHex, hexToBytes } from '../../units/mist-freenet/src/index.ts';
import { getSubtleCrypto } from '../../units/mist-freenet/src/subtle-crypto.ts';

export type MistDeviceSession = {
  uid: string;
  farmId: string;
  farmName: string;
  displayName: string;
  role: 'admin';
  createdAt: string;
  /** Hex-encoded 32-byte FarmSeed — only in memory after decrypt; encrypted on disk. */
  farmSeedHex: string;
  hasDevicePin: boolean;
};

/** Non-secret metadata for unlock UI (no FarmSeed). */
export type MistSessionMeta = {
  farmId: string;
  farmName: string;
  displayName: string;
  hasDevicePin: boolean;
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
): Promise<void> {
  const blob = await encryptSession(session, devicePin);
  ls()?.setItem(SESSION_BLOB_KEY, JSON.stringify(blob));
  saveMistSessionMeta({
    farmId: session.farmId,
    farmName: session.farmName,
    displayName: session.displayName,
    hasDevicePin: session.hasDevicePin,
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

export async function loadMistDeviceSession(devicePin?: string): Promise<MistDeviceSession | null> {
  const raw = ls()?.getItem(SESSION_BLOB_KEY);
  if (!raw) return null;
  try {
    const blob = JSON.parse(raw) as EncryptedBlob;
    return await decryptSession(blob, devicePin);
  } catch (err) {
    console.warn('[mist] session decrypt failed:', err);
    return null;
  }
}

export function clearMistDeviceSession(): void {
  ls()?.removeItem(SESSION_BLOB_KEY);
  ls()?.removeItem(SESSION_META_KEY);
  ls()?.removeItem(DEVICE_KEY_KEY);
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
}): MistDeviceSession {
  return {
    uid: `mist_${input.farmId.slice(0, 16)}`,
    farmId: input.farmId,
    farmName: input.farmName,
    displayName: input.displayName,
    role: 'admin',
    createdAt: new Date().toISOString(),
    farmSeedHex: bytesToHex(input.farmSeed),
    hasDevicePin: Boolean(input.devicePin && input.devicePin.replace(/\D/g, '').length >= 4),
  };
}
