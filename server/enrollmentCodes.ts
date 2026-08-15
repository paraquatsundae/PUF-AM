/**
 * Enrollment codes — the gate on `POST /api/auth/create-farm`.
 *
 * Before this, the only thing between the open internet and a new farm on
 * George's Firebase project was a per-process rate limit that reset on every
 * Cloud Run cold start (`Plans/FIREBASE_BILLING.md` §5.1). The billing posture
 * is Freenet-first with cloud for George's farms only, and that is a policy
 * only if the endpoint enforces it.
 *
 * Shape, per the plan (§5 item 1):
 * - Codes come from `PUF_ENROLLMENT_CODES` (comma-separated, Secret Manager on
 *   Cloud Run) or `secrets/enrollment-codes.json` (`{"codes": ["..."]}`) in the
 *   workshop. The secrets/ directory is already gitignored.
 * - **Fail closed.** No codes configured means farm creation is off, said
 *   plainly — not open with a warning.
 * - **Single-use**, enforced with a Firestore `create()` reservation keyed by
 *   the code's SHA-256, so it holds across instances and cold starts and the
 *   code itself is never stored. The reservation is taken *before* the farm is
 *   built and released if the build fails.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getAdminDb } from './firebaseAdmin.ts';

const USED_CODES = 'enrollment_code_uses';

/**
 * Codes are read over the phone and typed on tablets, so match forgivingly:
 * case-insensitive, and the dashes/spaces people add for readability ignored.
 */
export function normalizeEnrollmentCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

/** Parse the env-var form: comma-separated, blanks dropped. */
export function parseEnrollmentCodes(raw: string): string[] {
  return raw
    .split(',')
    .map((code) => normalizeEnrollmentCode(code))
    .filter((code) => code.length >= 6);
}

function codesFromSecretsFile(): string[] {
  const path = resolve(process.cwd(), 'secrets', 'enrollment-codes.json');
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { codes?: unknown };
    if (!Array.isArray(parsed.codes)) return [];
    return parsed.codes
      .filter((code): code is string => typeof code === 'string')
      .map((code) => normalizeEnrollmentCode(code))
      .filter((code) => code.length >= 6);
  } catch {
    return [];
  }
}

function configuredCodes(): string[] {
  const env = process.env.PUF_ENROLLMENT_CODES?.trim();
  if (env) return parseEnrollmentCodes(env);
  return codesFromSecretsFile();
}

export function enrollmentConfigured(): boolean {
  return configuredCodes().length > 0;
}

export function enrollmentCodeHash(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function codeHash(code: string): string {
  return enrollmentCodeHash(code);
}

/** How many configured codes have not been reserved yet. Does not reveal the codes. */
export function unusedEnrollmentCount(configured: string[], usedHashes: Iterable<string>): number {
  const used = new Set(usedHashes);
  return configured.filter((code) => !used.has(enrollmentCodeHash(code))).length;
}

/** Flat rather than a discriminated union — this tsconfig has no strictNullChecks. */
export type EnrollmentCheck = {
  ok: boolean;
  /** Set when ok. */
  codeHash?: string;
  /** Set when not ok. */
  status?: number;
  error?: string;
};

/**
 * Validate and *reserve* an enrollment code — the reservation is the single-use
 * guarantee, so call this before building anything and release it on failure.
 */
export async function reserveEnrollmentCode(input: string): Promise<EnrollmentCheck> {
  const codes = configuredCodes();
  if (codes.length === 0) {
    return {
      ok: false,
      status: 503,
      error:
        'Farm creation is closed on this server — no enrollment codes are configured. ' +
        'If you run this server, add secrets/enrollment-codes.json or set PUF_ENROLLMENT_CODES.',
    };
  }

  const code = normalizeEnrollmentCode(String(input || ''));
  if (!code || !codes.includes(code)) {
    return {
      ok: false,
      status: 403,
      error: 'Creating a cloud farm needs an enrollment code from whoever runs this server.',
    };
  }

  const hash = codeHash(code);
  try {
    // create() fails if the doc exists — that *is* the used-once check, atomic
    // across instances rather than a read-then-write race.
    await getAdminDb()
      .collection(USED_CODES)
      .doc(hash)
      .create({ reservedAt: new Date().toISOString() });
  } catch {
    return { ok: false, status: 403, error: 'That enrollment code has already been used.' };
  }
  return { ok: true, codeHash: hash };
}

/** The farm build failed after the reservation — give the code back. */
export async function releaseEnrollmentCode(hash: string): Promise<void> {
  await getAdminDb().collection(USED_CODES).doc(hash).delete().catch(() => undefined);
}

/** Stamp the reservation with what it was spent on, for the audit trail. */
export async function markEnrollmentCodeUsed(
  hash: string,
  used: { farmId: string; farmName: string },
): Promise<void> {
  await getAdminDb()
    .collection(USED_CODES)
    .doc(hash)
    .set({ ...used, usedAt: new Date().toISOString() }, { merge: true })
    .catch(() => undefined);
  console.log(`[auth] enrollment code ${hash.slice(0, 8)}… used for farm ${used.farmId}`);
}

export type EnrollmentUseRow = {
  hashPrefix: string;
  farmId: string | null;
  farmName: string | null;
  reservedAt: string | null;
  usedAt: string | null;
};

export type EnrollmentInventory = {
  configuredCount: number;
  unusedCount: number;
  uses: EnrollmentUseRow[];
};

/** Platform-admin audit: how many codes are left, and what the spent ones bought. */
export async function loadEnrollmentInventory(): Promise<EnrollmentInventory> {
  const configured = configuredCodes();
  const snap = await getAdminDb().collection(USED_CODES).get();
  const usedHashes: string[] = [];
  const uses: EnrollmentUseRow[] = [];
  for (const doc of snap.docs) {
    usedHashes.push(doc.id);
    const data = doc.data() as {
      farmId?: unknown;
      farmName?: unknown;
      reservedAt?: unknown;
      usedAt?: unknown;
    };
    uses.push({
      hashPrefix: doc.id.slice(0, 8),
      farmId: typeof data.farmId === 'string' ? data.farmId : null,
      farmName: typeof data.farmName === 'string' ? data.farmName : null,
      reservedAt: typeof data.reservedAt === 'string' ? data.reservedAt : null,
      usedAt: typeof data.usedAt === 'string' ? data.usedAt : null,
    });
  }
  uses.sort((a, b) => (b.usedAt || b.reservedAt || '').localeCompare(a.usedAt || a.reservedAt || ''));
  return {
    configuredCount: configured.length,
    unusedCount: unusedEnrollmentCount(configured, usedHashes),
    uses,
  };
}
