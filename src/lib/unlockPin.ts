/**
 * Personal unlock PIN — device-local gate after Firebase Auth is already restored.
 * Scoped per Firebase UID (farm membership rides on that account).
 * Invite / recovery PIN is separate and required once per new device.
 */

const SALT_PREFIX = 'pufom.unlock.salt.';
const HASH_PREFIX = 'pufom.unlock.hash.';
const SESSION_UNLOCKED_KEY = 'pufom.unlock.sessionUnlocked';
const PROMPT_DISMISS_PREFIX = 'pufom.unlock.setupDismissed.';

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function sessionStore(): Storage | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomSaltHex(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return toHex(arr.buffer);
}

async function deriveHash(pin: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const salt = new Uint8Array(
    saltHex.match(/.{1,2}/g)!.map((h) => parseInt(h, 16))
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 120_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return toHex(bits);
}

export function hasUnlockPin(uid: string): boolean {
  const s = storage();
  if (!s || !uid) return false;
  return Boolean(s.getItem(HASH_PREFIX + uid) && s.getItem(SALT_PREFIX + uid));
}

export function isSessionUnlocked(uid: string): boolean {
  if (!uid) return false;
  return sessionStore()?.getItem(SESSION_UNLOCKED_KEY) === uid;
}

export function markSessionUnlocked(uid: string): void {
  sessionStore()?.setItem(SESSION_UNLOCKED_KEY, uid);
}

export function clearSessionUnlock(): void {
  sessionStore()?.removeItem(SESSION_UNLOCKED_KEY);
}

/** Lock this browser tab/session (does not sign out of Firebase). */
export function lockSession(): void {
  clearSessionUnlock();
}

export async function setUnlockPin(uid: string, pin: string): Promise<void> {
  const s = storage();
  if (!s || !uid) throw new Error('Not signed in');
  const cleaned = pin.replace(/\D/g, '');
  if (cleaned.length < 4 || cleaned.length > 8) {
    throw new Error('Unlock PIN must be 4–8 digits');
  }
  const salt = randomSaltHex();
  const hash = await deriveHash(cleaned, salt);
  s.setItem(SALT_PREFIX + uid, salt);
  s.setItem(HASH_PREFIX + uid, hash);
  markSessionUnlocked(uid);
}

export async function verifyUnlockPin(uid: string, pin: string): Promise<boolean> {
  const s = storage();
  if (!s || !uid) return false;
  const salt = s.getItem(SALT_PREFIX + uid);
  const expected = s.getItem(HASH_PREFIX + uid);
  if (!salt || !expected) return false;
  const cleaned = pin.replace(/\D/g, '');
  const got = await deriveHash(cleaned, salt);
  return got === expected;
}

export function clearUnlockPin(uid: string): void {
  const s = storage();
  if (!s || !uid) return;
  s.removeItem(SALT_PREFIX + uid);
  s.removeItem(HASH_PREFIX + uid);
  s.removeItem(PROMPT_DISMISS_PREFIX + uid);
  clearSessionUnlock();
}

export function isSetupPromptDismissed(uid: string): boolean {
  return storage()?.getItem(PROMPT_DISMISS_PREFIX + uid) === '1';
}

export function dismissSetupPrompt(uid: string): void {
  storage()?.setItem(PROMPT_DISMISS_PREFIX + uid, '1');
}

export function needsUnlockGate(uid: string | null | undefined): boolean {
  if (!uid) return false;
  if (!hasUnlockPin(uid)) return false;
  return !isSessionUnlocked(uid);
}
