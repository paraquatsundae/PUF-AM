/**
 * FarmCode mint / parse / validate (mist-fc-1).
 * Browser-safe — Web Crypto for random bytes; Crockford per plan.
 * @see Plans/MIST_NETWORK_STORAGE.md § FarmCode encoding
 */

import {
  crockfordCheckSymbol,
  decodeCrockfordBase32,
  encodeCrockfordBase32,
  groupCrockfordBody,
  normalizeCrockfordChar,
  verifyCrockfordCheck,
} from './crockford.ts';
import { deriveFarmId, deriveFarmSeed } from './farm-seed.ts';

export const FARM_CODE_VERSION = 'mist-fc-1';
export const FARM_CODE_PAYLOAD_LEN = 26;
export const FARM_CODE_BODY_LEN = 27; // 26 payload + 1 check
export const FARM_CODE_RAW_BYTES = 16;

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
  /** 16-byte raw secret. */
  bytes: Uint8Array;
  farmSeed: Uint8Array;
  farmId: string;
};

function stripSeparators(body: string): string {
  return body.replace(/[\s-]/g, '');
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

  let version = FARM_CODE_VERSION;
  let rest = s;

  const prefixMatch = s.match(/^(mist-fc-\d+)-?(.*)$/i);
  if (prefixMatch) {
    version = prefixMatch[1]!.toLowerCase();
    rest = prefixMatch[2] ?? '';
  }

  const body = stripSeparators(rest)
    .split('')
    .map(normalizeCrockfordChar)
    .join('');

  if (!prefixMatch) {
    if (body.length === FARM_CODE_BODY_LEN) {
      version = FARM_CODE_VERSION;
    } else {
      throw new FarmCodeError(
        `Missing FarmCode version prefix (expected ${FARM_CODE_VERSION}) — paste the full line including prefix`,
      );
    }
  }

  if (version !== FARM_CODE_VERSION) {
    throw new FarmCodeError(`Unsupported FarmCode version: ${version}`);
  }

  if (body.length !== FARM_CODE_BODY_LEN) {
    throw new FarmCodeError(
      `FarmCode body must be ${FARM_CODE_BODY_LEN} symbols after removing spaces and hyphens (got ${body.length})`,
    );
  }

  return formatFarmCode(body);
}

/** Format 27 body symbols (payload+check) with hyphens + version prefix. */
export function formatFarmCode(body: string): string {
  const grouped = groupCrockfordBody(body);
  return `${FARM_CODE_VERSION}  ${grouped}`;
}

/** Mint a new FarmCode from CSPRNG (128-bit). */
export async function mintFarmCode(): Promise<string> {
  const bytes = new Uint8Array(FARM_CODE_RAW_BYTES);
  crypto.getRandomValues(bytes);
  const payload = encodeCrockfordBase32(bytes);
  if (payload.length !== FARM_CODE_PAYLOAD_LEN) {
    throw new FarmCodeError(`Unexpected payload length ${payload.length}`);
  }
  const check = crockfordCheckSymbol(payload);
  return formatFarmCode(payload + check);
}

/** Parse version prefix; returns remainder after prefix or throws. */
export function splitFarmCodeVersion(input: string): { version: string; body: string } {
  const normalized = normalizeFarmCodeInput(input);
  const match = normalized.match(/^(mist-fc-\d+)\s{2}(.+)$/i);
  if (!match) {
    throw new FarmCodeError(`Missing or unknown FarmCode version prefix (expected ${FARM_CODE_VERSION})`);
  }
  const version = match[1]!.toLowerCase();
  return { version, body: match[2]! };
}

/** Validate structure + check char; decode to 16 bytes (no HKDF). */
export function decodeFarmCodeBytes(input: string): Uint8Array {
  const canonical = normalizeFarmCodeInput(input);
  const { body } = splitFarmCodeVersion(canonical);
  const normalized = stripSeparators(body)
    .split('')
    .map(normalizeCrockfordChar)
    .join('');

  if (normalized.length !== FARM_CODE_BODY_LEN) {
    throw new FarmCodeError(
      `FarmCode body must be ${FARM_CODE_BODY_LEN} symbols (got ${normalized.length})`,
    );
  }

  const payload = normalized.slice(0, FARM_CODE_PAYLOAD_LEN);
  const check = normalized.slice(FARM_CODE_PAYLOAD_LEN);

  if (!verifyCrockfordCheck(payload, check)) {
    throw new FarmCodeError('FarmCode check character mismatch');
  }

  const bytes = decodeCrockfordBase32(payload);
  if (bytes.length !== FARM_CODE_RAW_BYTES) {
    throw new FarmCodeError(`Expected ${FARM_CODE_RAW_BYTES} bytes, got ${bytes.length}`);
  }
  return bytes;
}

/** Full parse: validate, decode, derive FarmSeed + FarmId. */
export async function parseFarmCode(input: string): Promise<ParsedFarmCode> {
  const canonical = normalizeFarmCodeInput(input);
  const { version } = splitFarmCodeVersion(canonical);
  const bytes = decodeFarmCodeBytes(canonical);
  const farmSeed = await deriveFarmSeed(bytes);
  const farmId = await deriveFarmId(farmSeed);
  const body = stripSeparators(splitFarmCodeVersion(canonical).body)
    .split('')
    .map(normalizeCrockfordChar)
    .join('');
  return {
    version,
    formatted: formatFarmCode(body),
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

/** Round-trip helper for tests: bytes → formatted FarmCode. */
export function encodeFarmCodeFromBytes(bytes: Uint8Array): string {
  if (bytes.length !== FARM_CODE_RAW_BYTES) {
    throw new FarmCodeError(`FarmCode requires ${FARM_CODE_RAW_BYTES} bytes`);
  }
  const payload = encodeCrockfordBase32(bytes);
  const check = crockfordCheckSymbol(payload);
  return formatFarmCode(payload + check);
}

export { deriveFarmSeed, deriveFarmId } from './farm-seed.ts';
