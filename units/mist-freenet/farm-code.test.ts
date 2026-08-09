import { describe, expect, it } from 'vitest';
import {
  CROCKFORD_ALPHABET,
  CROCKFORD_CHECK_ALPHABET,
  crockfordCheckSymbol,
  decodeCrockfordBase32,
  encodeCrockfordBase32,
  verifyCrockfordCheck,
} from './src/crockford.ts';
import {
  decodeFarmCodeBytes,
  encodeFarmCodeFromBytes,
  FARM_CODE_BODY_LEN,
  FARM_CODE_ENTROPY_BITS,
  FARM_CODE_LEGACY_BODY_LEN,
  FARM_CODE_LEGACY_VERSION,
  FARM_CODE_PAYLOAD_LEN,
  FARM_CODE_RAW_BYTES,
  FARM_CODE_SPECS,
  FARM_CODE_VERSION,
  farmCodeSymbolCount,
  farmCodeVersionForBody,
  formatFarmCode,
  formatFarmCodeInput,
  isValidFarmCode,
  mintFarmCode,
  normalizeFarmCodeInput,
  parseFarmCode,
} from './src/farm-code.ts';
import { bytesToHex, deriveFarmId, deriveFarmSeed, hexToBytes } from './src/farm-seed.ts';

/** Bare body of a formatted line, hyphens and version prefix removed. */
function bodyOf(formatted: string): string {
  return formatted.replace(/^mist-fc-\d+\s+/, '').replace(/-/g, '');
}

/** Search for a byte vector whose payload checksums to `target`. */
function bytesWithCheck(target: string, rawBytes = FARM_CODE_RAW_BYTES): Uint8Array {
  for (let i = 0; i < 20_000; i++) {
    const bytes = new Uint8Array(rawBytes);
    bytes[0] = i & 0xff;
    bytes[1] = (i >>> 8) & 0xff;
    if (crockfordCheckSymbol(encodeCrockfordBase32(bytes)) === target) return bytes;
  }
  throw new Error(`no vector found for check symbol ${target}`);
}

describe('Crockford Base32', () => {
  it('round-trips 16 random bytes', () => {
    const bytes = hexToBytes('0123456789abcdef0123456789abcdef');
    const enc = encodeCrockfordBase32(bytes);
    expect(enc.length).toBe(26);
    const dec = decodeCrockfordBase32(enc);
    expect(bytesToHex(dec)).toBe(bytesToHex(bytes));
  });

  it('accepts lowercase and hyphen separators on decode', () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    const payload = encodeCrockfordBase32(bytes);
    const grouped = payload.match(/.{1,5}/g)!.join('-').toLowerCase();
    expect(bytesToHex(decodeCrockfordBase32(grouped))).toBe(bytesToHex(bytes));
  });

  it('computes and verifies check symbol', () => {
    const payload = 'A'.repeat(FARM_CODE_PAYLOAD_LEN);
    const check = crockfordCheckSymbol(payload);
    expect(check).toHaveLength(1);
    expect(verifyCrockfordCheck(payload, check)).toBe(true);
    expect(verifyCrockfordCheck(payload, '0')).toBe(false);
  });
});

describe('FarmCode format contract', () => {
  it('mints the short mist-fc-2 form', () => {
    expect(FARM_CODE_VERSION).toBe('mist-fc-2');
    expect(FARM_CODE_RAW_BYTES).toBe(10);
    expect(FARM_CODE_ENTROPY_BITS).toBe(80);
    expect(FARM_CODE_PAYLOAD_LEN).toBe(16);
    expect(FARM_CODE_BODY_LEN).toBe(17);
  });

  it('keeps every spec byte-aligned and self-consistent', () => {
    for (const spec of FARM_CODE_SPECS) {
      expect(spec.entropyBits).toBe(spec.rawBytes * 8);
      expect(spec.payloadLen).toBe(Math.ceil((spec.rawBytes * 8) / 5));
      expect(spec.bodyLen).toBe(spec.payloadLen + 1);
    }
  });

  it('gives each version a distinct body length so a prefix-less paste is unambiguous', () => {
    const lengths = FARM_CODE_SPECS.map((s) => s.bodyLen);
    expect(new Set(lengths).size).toBe(lengths.length);
  });
});

describe('FarmCode mist-fc-2 (minted)', () => {
  const sampleBytes = hexToBytes('7a9c3e1f4b8d2a6c5e0f');

  it('encodes bytes to a short grouped line', () => {
    const formatted = encodeFarmCodeFromBytes(sampleBytes);
    expect(formatted.startsWith('mist-fc-2  ')).toBe(true);
    // 5-5-5-2 grouping, so exactly three hyphens in the body.
    expect(bodyOf(formatted)).toHaveLength(FARM_CODE_BODY_LEN);
    expect(formatted).toMatch(/^mist-fc-2 {2}[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z*~$=]{2}$/);
  });

  it('fits on one tablet line', () => {
    // `mist-fc-2` + two spaces + 17 symbols + 3 hyphens.
    expect(encodeFarmCodeFromBytes(sampleBytes)).toHaveLength(31);
  });

  it('round-trips encode → decode → same bytes', () => {
    const formatted = encodeFarmCodeFromBytes(sampleBytes);
    const decoded = decodeFarmCodeBytes(formatted);
    expect(bytesToHex(decoded)).toBe(bytesToHex(sampleBytes));
  });

  it('rejects wrong check character', () => {
    const body = bodyOf(encodeFarmCodeFromBytes(sampleBytes));
    const bad = formatFarmCode(body.slice(0, -1) + (body.endsWith('0') ? '1' : '0'));
    expect(isValidFarmCode(bad)).toBe(false);
    expect(() => decodeFarmCodeBytes(bad)).toThrow(/check character/i);
  });

  it('mints valid 80-bit codes', async () => {
    const code = await mintFarmCode();
    expect(code.startsWith(`${FARM_CODE_VERSION}  `)).toBe(true);
    expect(isValidFarmCode(code)).toBe(true);
    expect(bodyOf(code)).toHaveLength(FARM_CODE_BODY_LEN);

    const parsed = await parseFarmCode(code);
    expect(parsed.version).toBe(FARM_CODE_VERSION);
    expect(parsed.bytes.length).toBe(FARM_CODE_RAW_BYTES);
    expect(parsed.farmId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('mints distinct codes', async () => {
    const codes = new Set(await Promise.all([1, 2, 3, 4, 5].map(() => mintFarmCode())));
    expect(codes.size).toBe(5);
  });

  it('matches the plan illustrative layout', () => {
    const illustrative = 'mist-fc-2  7K9MN-PQRST-VWXY2-Z4';
    expect(bodyOf(illustrative)).toHaveLength(FARM_CODE_BODY_LEN);
    const minted = encodeFarmCodeFromBytes(new Uint8Array(FARM_CODE_RAW_BYTES));
    expect(minted.startsWith(FARM_CODE_VERSION)).toBe(true);
    expect(decodeFarmCodeBytes(minted).length).toBe(FARM_CODE_RAW_BYTES);
  });

  it('normalizes messy paste strings from mint display', async () => {
    const code = await mintFarmCode();

    const messyVariants = [
      code.toLowerCase(),
      code.replace('  ', ' '),
      code.replace(/-/g, ' - '),
      `FarmCode: ${code}`,
      code.replace(/(.{20})/, '$1\n'),
      code.replace(/^mist-fc-2\s+/, ''),
      // Crockford folds O→0 and I→1; the version digit is 2 so the prefix survives.
      code.replace(/0/g, 'O').replace(/1/g, 'I'),
    ];

    for (const messy of messyVariants) {
      expect(normalizeFarmCodeInput(messy)).toBe(code);
      expect(isValidFarmCode(messy)).toBe(true);
      const parsed = await parseFarmCode(messy);
      expect(parsed.formatted).toBe(code);
    }
  });

  it('derives FarmSeed via HKDF (deterministic for fixed bytes)', async () => {
    const seed1 = await deriveFarmSeed(sampleBytes);
    const seed2 = await deriveFarmSeed(sampleBytes);
    expect(bytesToHex(seed1)).toBe(bytesToHex(seed2));
    expect(seed1.length).toBe(32);

    const farmId = await deriveFarmId(seed1);
    expect(farmId).toHaveLength(32);

    const parsed = await parseFarmCode(encodeFarmCodeFromBytes(sampleBytes));
    expect(bytesToHex(parsed.farmSeed)).toBe(bytesToHex(seed1));
    expect(parsed.farmId).toBe(farmId);
  });
});

describe('FarmCode mist-fc-1 (legacy paper wallets)', () => {
  const legacyBytes = hexToBytes('7a9c3e1f4b8d2a6c5e0f1d3b7a9c4e2f');

  it('is never minted', async () => {
    expect((await mintFarmCode()).startsWith(FARM_CODE_LEGACY_VERSION)).toBe(false);
  });

  it('still encodes and decodes the long form from 16 bytes', () => {
    const formatted = encodeFarmCodeFromBytes(legacyBytes);
    expect(formatted.startsWith(`${FARM_CODE_LEGACY_VERSION}  `)).toBe(true);
    expect(bodyOf(formatted)).toHaveLength(FARM_CODE_LEGACY_BODY_LEN);
    expect(bytesToHex(decodeFarmCodeBytes(formatted))).toBe(bytesToHex(legacyBytes));
  });

  it('recovers the same farm identity it always did', async () => {
    const parsed = await parseFarmCode(encodeFarmCodeFromBytes(legacyBytes));
    expect(parsed.version).toBe(FARM_CODE_LEGACY_VERSION);
    // Frozen vector from the two-laptop recovery smoke — must not drift.
    expect(parsed.farmId).toBe('098b7877a1d5a1bd04dc5ab0fd9dfb7d');
    expect(bytesToHex(parsed.farmSeed)).toBe(
      'ba5321465c872085aa7b70be572e0aa46b49188b6bb9e05677ddb2931da81c41',
    );
  });

  it('normalizes a legacy body pasted without its prefix (length picks the version)', () => {
    const formatted = encodeFarmCodeFromBytes(legacyBytes);
    const bodyOnly = formatted.replace(/^mist-fc-1\s+/, '');
    expect(normalizeFarmCodeInput(bodyOnly)).toBe(formatted);
    expect(farmCodeVersionForBody(bodyOnly)).toBe(FARM_CODE_LEGACY_VERSION);
  });

  it('rejects a legacy code with a broken check character', () => {
    const body = bodyOf(encodeFarmCodeFromBytes(legacyBytes));
    const bad = formatFarmCode(body.slice(0, -1) + (body.endsWith('0') ? '1' : '0'));
    expect(bad.startsWith(FARM_CODE_LEGACY_VERSION)).toBe(true);
    expect(isValidFarmCode(bad)).toBe(false);
  });
});

describe('FarmCode check symbol', () => {
  it('never mints one that needs a punctuation keyboard', async () => {
    for (let i = 0; i < 40; i++) {
      const code = await mintFarmCode();
      expect(CROCKFORD_ALPHABET.includes(code.slice(-1))).toBe(true);
    }
  });

  it('accepts all 37 Crockford check symbols on decode, including U', () => {
    for (const check of CROCKFORD_CHECK_ALPHABET) {
      const bytes = bytesWithCheck(check);
      const formatted = encodeFarmCodeFromBytes(bytes);
      expect(formatted.endsWith(check)).toBe(true);
      expect(isValidFarmCode(formatted)).toBe(true);
      expect(bytesToHex(decodeFarmCodeBytes(formatted))).toBe(bytesToHex(bytes));
    }
  });

  it('accepts legacy check symbols too', () => {
    for (const check of ['U', '*', '~', '$', '=']) {
      const bytes = bytesWithCheck(check, 16);
      const formatted = encodeFarmCodeFromBytes(bytes);
      expect(formatted.startsWith(FARM_CODE_LEGACY_VERSION)).toBe(true);
      expect(isValidFarmCode(formatted)).toBe(true);
    }
  });

  it('still forgives a hand-written O for 0 in the check position', () => {
    const bytes = bytesWithCheck('0');
    const formatted = encodeFarmCodeFromBytes(bytes);
    expect(isValidFarmCode(`${formatted.slice(0, -1)}O`)).toBe(true);
  });
});

describe('FarmCode validation failures', () => {
  it('reports empty input', () => {
    expect(() => normalizeFarmCodeInput('')).toThrow(/empty/i);
  });

  it('reports symbol count for a short body rather than blaming the prefix', () => {
    expect(() => normalizeFarmCodeInput('FAKE-BODY')).toThrow(/17 symbols/);
    expect(() => normalizeFarmCodeInput('A'.repeat(16))).toThrow(/got 16/);
  });

  it('rejects unknown version prefixes', () => {
    expect(() => normalizeFarmCodeInput(`mist-fc-9  ${'A'.repeat(17)}`)).toThrow(/unsupported/i);
    expect(isValidFarmCode(`mist-fc-9  ${'A'.repeat(17)}`)).toBe(false);
  });

  it('rejects a known version carrying the wrong body length', () => {
    expect(() => normalizeFarmCodeInput(`mist-fc-2  ${'A'.repeat(27)}`)).toThrow(/17 symbols/);
    expect(() => normalizeFarmCodeInput(`mist-fc-1  ${'A'.repeat(17)}`)).toThrow(/27 symbols/);
  });
});

describe('formatFarmCodeInput (tablet entry)', () => {
  it('uppercases and drops junk', () => {
    expect(formatFarmCodeInput('')).toBe('');
    expect(formatFarmCodeInput('  ')).toBe('');
    expect(formatFarmCodeInput('ab')).toBe('AB');
    expect(formatFarmCodeInput('a!b@c#d(e)')).toBe('ABCDE');
  });

  it('keeps the Crockford check-only symbols a legacy wallet may carry', () => {
    for (const check of ['*', '~', '$', '=', 'U']) {
      expect(formatFarmCodeInput(`ABCDEFGHJKMNPQRS${check}`)).toBe(`ABCDE-FGHJK-MNPQR-S${check}`);
    }
  });

  it('inserts hyphens every five symbols and never trails one', () => {
    expect(formatFarmCodeInput('ABCDE')).toBe('ABCDE');
    expect(formatFarmCodeInput('ABCDEF')).toBe('ABCDE-F');
    expect(formatFarmCodeInput('ABCDEFGHJK')).toBe('ABCDE-FGHJK');
    expect(formatFarmCodeInput('ABCDEFGHJKMNPQRST')).toBe('ABCDE-FGHJK-MNPQR-ST');
    for (let n = 1; n <= 27; n++) {
      expect(formatFarmCodeInput('A'.repeat(n)).endsWith('-')).toBe(false);
    }
  });

  it('is idempotent, so re-formatting each keystroke is stable', () => {
    const once = formatFarmCodeInput('abcdefghjkmnpqrst');
    expect(formatFarmCodeInput(once)).toBe(once);
  });

  it('lets backspace remove a symbol instead of stalling on a hyphen', () => {
    const full = formatFarmCodeInput('ABCDEF');
    expect(full).toBe('ABCDE-F');
    // Browser deletes the trailing character, then the field reformats.
    expect(formatFarmCodeInput(full.slice(0, -1))).toBe('ABCDE');
  });

  it('strips a pasted version prefix and label', () => {
    expect(formatFarmCodeInput('mist-fc-2  ABCDE-FGHJK-MNPQR-ST')).toBe('ABCDE-FGHJK-MNPQR-ST');
    expect(formatFarmCodeInput('MIST-FC-2 ABCDEFGHJKMNPQRST')).toBe('ABCDE-FGHJK-MNPQR-ST');
    expect(formatFarmCodeInput('mist - fc - 2 - ABCDEFGHJKMNPQRST')).toBe('ABCDE-FGHJK-MNPQR-ST');
    expect(formatFarmCodeInput('FarmCode: mist-fc-2  ABCDE-FGHJK-MNPQR-ST')).toBe(
      'ABCDE-FGHJK-MNPQR-ST',
    );
  });

  it('keeps a body that merely starts with the letters of the prefix', () => {
    // `mist` is not stripped without a version digit behind it.
    expect(formatFarmCodeInput('MISTF')).toBe('MISTF');
    expect(formatFarmCodeInput('MISTFCGHJKMNPQRST')).toBe('MISTF-CGHJK-MNPQR-ST');
  });

  it('caps at the longest accepted body so a legacy paste survives', () => {
    const legacy = formatFarmCodeInput('A'.repeat(40));
    expect(farmCodeSymbolCount(legacy)).toBe(FARM_CODE_LEGACY_BODY_LEN);
  });

  it('feeds normalizeFarmCodeInput directly — the operator never types a prefix', async () => {
    const minted = await mintFarmCode();
    const typed = formatFarmCodeInput(bodyOf(minted).toLowerCase());
    expect(farmCodeSymbolCount(typed)).toBe(FARM_CODE_BODY_LEN);
    expect(farmCodeVersionForBody(typed)).toBe(FARM_CODE_VERSION);
    expect(normalizeFarmCodeInput(typed)).toBe(minted);
  });

  it('reports no version until a complete body is typed', () => {
    expect(farmCodeVersionForBody('')).toBeNull();
    expect(farmCodeVersionForBody(formatFarmCodeInput('A'.repeat(16)))).toBeNull();
    expect(farmCodeVersionForBody(formatFarmCodeInput('A'.repeat(17)))).toBe(FARM_CODE_VERSION);
    expect(farmCodeVersionForBody(formatFarmCodeInput('A'.repeat(27)))).toBe(
      FARM_CODE_LEGACY_VERSION,
    );
  });

  it('counts symbols, not hyphens', () => {
    expect(farmCodeSymbolCount('ABCDE-FGHJK')).toBe(10);
    expect(farmCodeSymbolCount('')).toBe(0);
  });
});
