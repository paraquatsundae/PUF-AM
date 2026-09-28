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
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { resolvePlatformAdminClaim } from './memberClaims.ts';
import { getAdminAuth, getAdminDb } from './firebaseAdmin.ts';

const USED_CODES = 'enrollment_code_uses';
/** Issued by a signed-in project admin. Doc id is the code hash. No plaintext. */
const ISSUED_CODES = 'enrollment_code_issues';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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
 * Who may mint a code. A platform admin always may. If the project has none
 * yet, the signed-in Google account becomes that admin — there is no secret
 * file above them. A PIN identity never may.
 */
export function mayMintEnrollmentCode(input: {
  platformAdmin: boolean;
  pinAuth: boolean;
  email: string;
  anyPlatformAdmin: boolean;
}): { ok: boolean; bootstrap: boolean; status?: number; error?: string } {
  const email = input.email.trim().toLowerCase();
  if (!email || email.endsWith('@sentinut.local') || input.pinAuth) {
    return {
      ok: false,
      bootstrap: false,
      status: 403,
      error: 'Enrollment codes are issued by the project admin Google account.',
    };
  }
  if (input.platformAdmin || !input.anyPlatformAdmin) {
    return { ok: true, bootstrap: !input.platformAdmin };
  }
  return {
    ok: false,
    bootstrap: false,
    status: 403,
    error: 'Only a platform admin can generate enrollment codes.',
  };
}

/** Readable form of a new code. Dashes are ignored when it is typed back. */
export function formatEnrollmentCode(raw: string): string {
  const code = normalizeEnrollmentCode(raw);
  if (code.length <= 5) return code;
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

function randomEnrollmentCode(): string {
  const bytes = randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return formatEnrollmentCode(out);
}

/** True when some Firebase user already carries the platform-admin claim. */
export async function projectHasPlatformAdmin(): Promise<boolean> {
  const auth = getAdminAuth();
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page++) {
    const listed = await auth.listUsers(1000, pageToken);
    for (const user of listed.users) {
      if (resolvePlatformAdminClaim(user.customClaims || null)) return true;
    }
    pageToken = listed.pageToken;
    if (!pageToken) return false;
  }
  return false;
}

/**
 * Mint a single-use code. Plaintext is returned once; Firestore keeps the hash.
 */
export async function issueEnrollmentCode(issuer: {
  uid: string;
  email: string;
}): Promise<{ code: string }> {
  const code = randomEnrollmentCode();
  const hash = codeHash(normalizeEnrollmentCode(code));
  await getAdminDb()
    .collection(ISSUED_CODES)
    .doc(hash)
    .create({
      issuedAt: new Date().toISOString(),
      issuedByUid: issuer.uid,
      issuedByEmail: issuer.email,
    });
  return { code };
}

/**
 * Validate and *reserve* an enrollment code — the reservation is the single-use
 * guarantee, so call this before building anything and release it on failure.
 * A code is valid when it was configured on the server or minted by an admin.
 */
export async function reserveEnrollmentCode(input: string): Promise<EnrollmentCheck> {
  const code = normalizeEnrollmentCode(String(input || ''));
  const configured = configuredCodes();
  if (!code || code.length < 6) {
    return {
      ok: false,
      status: 403,
      error: 'Creating a cloud farm needs an enrollment code from whoever runs this server.',
    };
  }

  const hash = codeHash(code);
  const issued = await getAdminDb().collection(ISSUED_CODES).doc(hash).get();
  const known = configured.includes(code) || issued.exists;
  if (!known) {
    if (configured.length === 0) {
      const anyIssued = await getAdminDb().collection(ISSUED_CODES).limit(1).get();
      if (anyIssued.empty) {
        return {
          ok: false,
          status: 503,
          error:
            'Farm creation is closed until a project admin generates an enrollment code. ' +
            'Sign in with the admin Google account and use Generate a code.',
        };
      }
    }
    return {
      ok: false,
      status: 403,
      error: 'Creating a cloud farm needs an enrollment code from whoever runs this server.',
    };
  }

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
  const db = getAdminDb();
  const [snap, issuedSnap] = await Promise.all([
    db.collection(USED_CODES).get(),
    db.collection(ISSUED_CODES).get(),
  ]);
  const known = new Set<string>([
    ...configured.map((code) => enrollmentCodeHash(code)),
    ...issuedSnap.docs.map((doc) => doc.id),
  ]);
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
  const used = new Set(usedHashes);
  let unusedCount = 0;
  for (const hash of known) if (!used.has(hash)) unusedCount += 1;
  return {
    configuredCount: known.size,
    unusedCount,
    uses,
  };
}
