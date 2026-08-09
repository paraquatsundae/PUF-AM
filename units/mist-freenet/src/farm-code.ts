/**
 * FarmCode mint / parse / validate.
 *
 * Two printable versions exist and both decode forever:
 *
 * - `mist-fc-2` (**minted today**) — 10 bytes / **80 bits** → 16 payload symbols
 *   + 1 check, `mist-fc-2  XXXXX-XXXXX-XXXXX-XX`. Short enough for a gloved
 *   thumb on a tablet in a shed, which is where recovery actually happens.
 * - `mist-fc-1` (**legacy, decode-only**) — 16 bytes / 128 bits → 26 payload
 *   symbols + 1 check. Farms minted before the shortening keep working; their
 *   FarmSeed and FarmId are unchanged because HKDF runs over the raw bytes.
 *
 * Browser-safe — Web Crypto for random bytes; Crockford per plan.
 * @see Plans/MIST_NETWORK_STORAGE.md § FarmCode encoding
 */

import {
  CROCKFORD_ALPHABET,
  crockfordCheckSymbol,
  decodeCrockfordBase32,
  encodeCrockfordBase32,
  groupCrockfordBody,
  normalizeCrockfordChar,
  verifyCrockfordCheck,
} from './crockford.ts';
import { deriveFarmId, deriveFarmSeed } from './farm-seed.ts';

/** One printable FarmCode generation. `payloadLen` is always `ceil(rawBytes * 8 / 5)`. */
export type FarmCodeSpec = {
  version: string;
  payloadLen: number;
  /** Payload + 1 check symbol — what an operator actually types. */
  bodyLen: number;
  rawBytes: number;
  entropyBits: number;
};

/**
 * Newest first. Order matters: the head is what `mintFarmCode` produces, and
 * everything else is accepted on the recovery path but never issued again.
 */
export const FARM_CODE_SPECS: readonly FarmCodeSpec[] = [
  { version: 'mist-fc-2', payloadLen: 16, bodyLen: 17, rawBytes: 10, entropyBits: 80 },
  { version: 'mist-fc-1', payloadLen: 26, bodyLen: 27, rawBytes: 16, entropyBits: 128 },
];

const MINT_SPEC = FARM_CODE_SPECS[0]!;

/** Version minted for new farms. */
export const FARM_CODE_VERSION = MINT_SPEC.version;
export const FARM_CODE_PAYLOAD_LEN = MINT_SPEC.payloadLen;
export const FARM_CODE_BODY_LEN = MINT_SPEC.bodyLen;
export const FARM_CODE_RAW_BYTES = MINT_SPEC.rawBytes;
export const FARM_CODE_ENTROPY_BITS = MINT_SPEC.entropyBits;

/** Long form still in the wild on paper wallets — accepted, never minted. */
export const FARM_CODE_LEGACY_VERSION = 'mist-fc-1';
export const FARM_CODE_LEGACY_BODY_LEN = 27;

/** A pasted legacy code has to survive the tablet input field intact. */
const FARM_CODE_MAX_BODY_LEN = Math.max(...FARM_CODE_SPECS.map((s) => s.bodyLen));

export class FarmCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FarmCodeError';
  }
}

export type ParsedFarmCode = {
  version: string;
  /** Full printable line including prefix and hyphens. */
  formatted: string;
  /** Raw secret — 10 bytes for `mist-fc-2`, 16 for legacy `mist-fc-1`. */
  bytes: Uint8Array;
  farmSeed: Uint8Array;
  farmId: string;
};

function specForVersion(version: string): FarmCodeSpec | undefined {
  const v = version.toLowerCase();
  return FARM_CODE_SPECS.find((s) => s.version === v);
}

/** Body lengths are distinct across versions, so a prefix-less paste is unambiguous. */
function specForBodyLen(len: number): FarmCodeSpec | undefined {
  return FARM_CODE_SPECS.find((s) => s.bodyLen === len);
}

function specForRawBytes(len: number): FarmCodeSpec | undefined {
  return FARM_CODE_SPECS.find((s) => s.rawBytes === len);
}

function knownVersions(): string {
  return FARM_CODE_SPECS.map((s) => s.version).join(' / ');
}

function stripSeparators(body: string): string {
  return body.replace(/[\s-]/g, '');
}

/**
 * Strip separators and uppercase, but do **not** fold ambiguous characters.
 * Folding is payload-only: the trailing check symbol may legitimately be `U`,
 * which `normalizeCrockfordChar` would turn into `V`.
 */
function cleanBody(body: string): string {
  return stripSeparators(body).toUpperCase();
}

function foldPayload(payload: string): string {
  return payload.split('').map(normalizeCrockfordChar).join('');
}

/**
 * Fold the payload, and snap the check symbol to the form the payload implies.
 *
 * The check symbol cannot be folded blindly — `U` is a legitimate check symbol
 * that `normalizeCrockfordChar` would turn into `V`. It is instead rewritten only
 * when what the operator wrote folds to the expected symbol (`I`/`L` for `1`, `O`
 * for `0`, `U` for `V`), which is the same tolerance `verifyCrockfordCheck`
 * already grants. Without this, a hand-copied code passes validation but
 * canonicalizes to a look-alike that compares unequal to the minted string.
 */
function canonicalBody(cleaned: string, spec: FarmCodeSpec): string {
  const payload = foldPayload(cleaned.slice(0, spec.payloadLen));
  const written = cleaned.slice(spec.payloadLen);
  return payload + snapCheckSymbol(payload, written);
}

function snapCheckSymbol(payload: string, written: string): string {
  if (written.length !== 1) return written;
  let expected: string;
  try {
    expected = crockfordCheckSymbol(payload);
  } catch {
    // Payload has an unusable symbol; leave the check alone and let decode report it.
    return written;
  }
  return normalizeCrockfordChar(written) === expected ? expected : written;
}

/** Strip common UI labels pasted with the code. */
function stripFarmCodeLabels(input: string): string {
  return input.replace(/^(?:farm\s*code|recovery\s*(?:code|key))\s*:?\s*/i, '').trim();
}

/**
 * Normalize messy paste input before parse/validate.
 * Handles labels, newlines, spaces around hyphens (incl. `mist - fc - 1`), body-only paste, case.
 */
export function normalizeFarmCodeInput(raw: string): string {
  let s = stripFarmCodeLabels(raw.trim());
  if (!s) {
    throw new FarmCodeError('FarmCode is empty');
  }

  // Collapse whitespace/newlines, then normalize hyphen spacing (fixes spaced version prefix too).
  s = s.replace(/\s+/g, ' ').replace(/\s*-\s*/g, '-');

  const prefixMatch = s.match(/^(mist-fc-\d+)-?(.*)$/i);
  const body = cleanBody(prefixMatch ? (prefixMatch[2] ?? '') : s);

  let spec: FarmCodeSpec | undefined;
  if (prefixMatch) {
    const version = prefixMatch[1]!.toLowerCase();
    spec = specForVersion(version);
    if (!spec) {
      throw new FarmCodeError(`Unsupported FarmCode version: ${version} (expected ${knownVersions()})`);
    }
  } else {
    // The tablet field is body-only and paper wallet copies often drop the
    // prefix, so recover the version from the length and complain about symbol
    // count rather than a prefix the operator was never asked to type.
    spec = specForBodyLen(body.length);
    if (!spec) {
      throw new FarmCodeError(
        `FarmCode must be ${MINT_SPEC.bodyLen} symbols — got ${body.length} ` +
          `(legacy ${FARM_CODE_LEGACY_VERSION} codes are ${FARM_CODE_LEGACY_BODY_LEN})`,
      );
    }
  }

  if (body.length !== spec.bodyLen) {
    throw new FarmCodeError(
      `${spec.version} body must be ${spec.bodyLen} symbols after removing spaces and hyphens (got ${body.length})`,
    );
  }

  return formatFarmCode(canonicalBody(body, spec), spec.version);
}

/**
 * Format body symbols (payload+check) with hyphens + version prefix.
 * Version is inferred from the body length when not given, so a legacy body
 * still formats back to a `mist-fc-1` line.
 */
export function formatFarmCode(body: string, version?: string): string {
  const spec = version ? specForVersion(version) : specForBodyLen(body.length);
  const prefix = spec?.version ?? version?.toLowerCase() ?? FARM_CODE_VERSION;
  return `${prefix}  ${groupCrockfordBody(body)}`;
}

/**
 * Format a half-typed FarmCode **body** for display in an input, so hyphens
 * appear on their own and the operator only enters symbols. The version prefix
 * is not typed — it is static UI next to the field, and `normalizeFarmCodeInput`
 * recovers it from the length on submit.
 *
 * Tolerant of a full pasted line: a `mist-fc-N` prefix or a `FarmCode:` label is
 * stripped, and the cap is the longest accepted body so a legacy 27-symbol code
 * survives the field. No hyphen is ever appended to the end, so backspace always
 * removes a symbol instead of stalling on punctuation. Ambiguous characters are
 * left alone here — `normalizeFarmCodeInput` folds `O`/`I`/`L` on submit, and
 * swapping a symbol out from under a typist is worse than a late hint.
 */
export function formatFarmCodeInput(raw: string): string {
  const withoutPrefix = String(raw ?? '')
    .replace(/^\s*(?:farm\s*code|recovery\s*(?:code|key))\s*:?\s*/i, '')
    // Requires the version digit, so a body that happens to start `MIST…` survives.
    .replace(/^\s*mist[\s-]*fc[\s-]*\d+[\s-]*/i, '');

  const cleaned = withoutPrefix
    .toUpperCase()
    // `*~$=` are kept because a legacy mist-fc-1 wallet may carry one as its
    // check symbol; freshly minted codes never do.
    .replace(/[^0-9A-Z*~$=]/g, '')
    .slice(0, FARM_CODE_MAX_BODY_LEN);

  return cleaned ? groupCrockfordBody(cleaned) : '';
}

/** Symbols entered so far, ignoring the hyphens the formatter inserts. */
export function farmCodeSymbolCount(value: string): number {
  return stripSeparators(String(value ?? '')).length;
}

/** Which version a bare body length implies, or `null` if it is not a complete body. */
export function farmCodeVersionForBody(body: string): string | null {
  return specForBodyLen(farmCodeSymbolCount(body))?.version ?? null;
}

/** Parse version prefix; returns remainder after prefix or throws. */
export function splitFarmCodeVersion(input: string): { version: string; body: string } {
  const normalized = normalizeFarmCodeInput(input);
  const match = normalized.match(/^(mist-fc-\d+)\s{2}(.+)$/i);
  if (!match) {
    throw new FarmCodeError(`Missing or unknown FarmCode version prefix (expected ${knownVersions()})`);
  }
  const version = match[1]!.toLowerCase();
  return { version, body: match[2]! };
}

/** Validate structure + check char; decode to raw bytes for this version (no HKDF). */
export function decodeFarmCodeBytes(input: string): Uint8Array {
  const canonical = normalizeFarmCodeInput(input);
  const { version, body } = splitFarmCodeVersion(canonical);
  const spec = specForVersion(version);
  if (!spec) {
    throw new FarmCodeError(`Unsupported FarmCode version: ${version} (expected ${knownVersions()})`);
  }

  const normalized = canonicalBody(cleanBody(body), spec);
  if (normalized.length !== spec.bodyLen) {
    throw new FarmCodeError(
      `${spec.version} body must be ${spec.bodyLen} symbols (got ${normalized.length})`,
    );
  }

  const payload = normalized.slice(0, spec.payloadLen);
  const check = normalized.slice(spec.payloadLen);

  if (!verifyCrockfordCheck(payload, check)) {
    throw new FarmCodeError('FarmCode check character mismatch');
  }

  const bytes = decodeCrockfordBase32(payload);
  if (bytes.length !== spec.rawBytes) {
    throw new FarmCodeError(`Expected ${spec.rawBytes} bytes, got ${bytes.length}`);
  }
  return bytes;
}

/**
 * Mint a new FarmCode from CSPRNG (80-bit `mist-fc-2`).
 *
 * Payloads whose Crockford check symbol lands on `*`, `~`, `$`, `=` or `U` are
 * resampled: those five are unreachable on a tablet's letter/number keyboard (and
 * `U` is ambiguous with `V` when handwritten), which defeats the point of a code
 * you are meant to type in a shed. Discarding 5 of 37 possible checksums costs
 * about 0.2 bits of the 80, and decode still accepts the full Crockford check
 * alphabet so legacy paper wallets are unaffected.
 */
export async function mintFarmCode(): Promise<string> {
  const bytes = new Uint8Array(MINT_SPEC.rawBytes);
  for (let attempt = 0; attempt < 64; attempt++) {
    crypto.getRandomValues(bytes);
    const payload = encodeCrockfordBase32(bytes);
    if (CROCKFORD_ALPHABET.includes(crockfordCheckSymbol(payload))) {
      return encodeFarmCodeFromBytes(bytes);
    }
  }
  throw new FarmCodeError('Could not mint a FarmCode with a typable check symbol');
}

/** Full parse: validate, decode, derive FarmSeed + FarmId. */
export async function parseFarmCode(input: string): Promise<ParsedFarmCode> {
  const canonical = normalizeFarmCodeInput(input);
  const { version } = splitFarmCodeVersion(canonical);
  const bytes = decodeFarmCodeBytes(canonical);
  const farmSeed = await deriveFarmSeed(bytes);
  const farmId = await deriveFarmId(farmSeed);
  return {
    version,
    formatted: canonical,
    bytes,
    farmSeed,
    farmId,
  };
}

/** True when input passes version + length + check validation. */
export function isValidFarmCode(input: string): boolean {
  try {
    decodeFarmCodeBytes(input);
    return true;
  } catch {
    return false;
  }
}

/** bytes → formatted FarmCode; the byte count picks the version. */
export function encodeFarmCodeFromBytes(bytes: Uint8Array): string {
  const spec = specForRawBytes(bytes.length);
  if (!spec) {
    const sizes = FARM_CODE_SPECS.map((s) => `${s.rawBytes} (${s.version})`).join(' or ');
    throw new FarmCodeError(`FarmCode requires ${sizes} bytes, got ${bytes.length}`);
  }
  const payload = encodeCrockfordBase32(bytes);
  if (payload.length !== spec.payloadLen) {
    throw new FarmCodeError(`Unexpected payload length ${payload.length} for ${spec.version}`);
  }
  const check = crockfordCheckSymbol(payload);
  return formatFarmCode(payload + check, spec.version);
}

export { deriveFarmSeed, deriveFarmId } from './farm-seed.ts';
