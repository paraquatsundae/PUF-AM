/**
 * Bring-your-own Firebase — parse, persist, and refuse George's project.
 *
 * The web SDK config is public by design. What this file must never do is
 * accept the PUFworks project as "yours": that would let a wizard create a
 * farm on George's bill without an enrollment code.
 *
 * Applied on the next boot via `src/firebase.ts` (persist, then reload).
 *
 * @see Plans/FIREBASE_BILLING.md §3
 */

import builtIn from '../../firebase-applet-config.json';

export const BYO_STORAGE_KEY = 'pufam.byoFirebase.v1';
export const BYO_DEFAULT_DATABASE = '(default)';
export const PUFWORKS_PROJECT_ID = builtIn.projectId;

export const BILLING_ACK_TEXT =
  'I understand I am connecting my own Firebase project and that I am responsible for its billing.';

export type ByoFirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
  /** Always `(default)` — a named database loses Google's no-cost allowance. */
  firestoreDatabaseId: typeof BYO_DEFAULT_DATABASE;
};

export type ByoFirebaseStored = {
  v: 1;
  config: ByoFirebaseWebConfig;
  billingAck: { text: string; at: string };
};

export type ParseByoConfigResult =
  | { ok: true; config: ByoFirebaseWebConfig; namedDatabaseDropped: boolean }
  | { ok: false; error: string };

/** `tsconfig` has no strictNullChecks — `!result.ok` does not narrow this union. */
export function parseByoConfigError(result: ParseByoConfigResult): string | null {
  return 'error' in result ? result.error : null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Paste the Firebase web config JSON.');
  if (trimmed.startsWith('{')) return JSON.parse(trimmed) as unknown;
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('Could not find a { … } object in what you pasted.');
  }
  return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
}

/**
 * Accepts the Firebase console snippet or `firebase-applet-config.json`.
 * Always forces the default database and rejects the PUFworks project.
 */
export function parseByoFirebaseConfig(raw: string): ParseByoConfigResult {
  let parsed: unknown;
  try {
    parsed = extractJsonObject(raw);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON.' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Config must be a JSON object.' };
  }
  const rec = parsed as Record<string, unknown>;
  const apiKey = asNonEmptyString(rec.apiKey);
  const authDomain = asNonEmptyString(rec.authDomain);
  const projectId = asNonEmptyString(rec.projectId);
  const appId = asNonEmptyString(rec.appId);
  if (!apiKey || !authDomain || !projectId || !appId) {
    return {
      ok: false,
      error: 'Need apiKey, authDomain, projectId and appId from Project settings → Your apps.',
    };
  }
  if (projectId === PUFWORKS_PROJECT_ID) {
    return {
      ok: false,
      error:
        'That is the PUFworks project. Use Cloud sync → PUFworks cloud with an invite PIN or enrollment code — do not paste it here.',
    };
  }

  const named = asNonEmptyString(rec.firestoreDatabaseId);
  const namedDatabaseDropped = Boolean(named && named !== BYO_DEFAULT_DATABASE);

  const config: ByoFirebaseWebConfig = {
    apiKey,
    authDomain,
    projectId,
    appId,
    firestoreDatabaseId: BYO_DEFAULT_DATABASE,
  };
  const storageBucket = asNonEmptyString(rec.storageBucket);
  const messagingSenderId = asNonEmptyString(rec.messagingSenderId);
  const measurementId = asNonEmptyString(rec.measurementId);
  if (storageBucket) config.storageBucket = storageBucket;
  if (messagingSenderId) config.messagingSenderId = messagingSenderId;
  if (measurementId) config.measurementId = measurementId;
  return { ok: true, config, namedDatabaseDropped };
}

export function readStoredByoFirebase(): ByoFirebaseStored | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(BYO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ByoFirebaseStored;
    if (parsed?.v !== 1 || !parsed.config?.projectId || !parsed.config.apiKey) return null;
    if (parsed.config.projectId === PUFWORKS_PROJECT_ID) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isByoFirebase(): boolean {
  return readStoredByoFirebase() != null;
}

export function byoProjectId(): string | null {
  return readStoredByoFirebase()?.config.projectId ?? null;
}

export function persistByoFirebase(config: ByoFirebaseWebConfig, ackAt = new Date().toISOString()): void {
  if (config.projectId === PUFWORKS_PROJECT_ID) {
    throw new Error('Refusing to persist the PUFworks project as bring-your-own.');
  }
  const stored: ByoFirebaseStored = {
    v: 1,
    config: { ...config, firestoreDatabaseId: BYO_DEFAULT_DATABASE },
    billingAck: { text: BILLING_ACK_TEXT, at: ackAt },
  };
  localStorage.setItem(BYO_STORAGE_KEY, JSON.stringify(stored));
}

export function clearByoFirebase(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(BYO_STORAGE_KEY);
}

export function persistByoFirebaseAndReload(config: ByoFirebaseWebConfig): void {
  persistByoFirebase(config);
  window.location.reload();
}

export function clearByoFirebaseAndReload(): void {
  clearByoFirebase();
  window.location.reload();
}

/** Config the SDK should boot with — BYO if this device chose it, else PUFworks. */
export function resolveFirebaseWebConfig(): {
  config: ByoFirebaseWebConfig | typeof builtIn;
  byo: boolean;
} {
  const stored = readStoredByoFirebase();
  if (stored) return { config: stored.config, byo: true };
  return { config: builtIn, byo: false };
}
