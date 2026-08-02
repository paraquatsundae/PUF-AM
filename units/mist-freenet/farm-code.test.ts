import { describe, expect, it } from 'vitest';
import {
  crockfordCheckSymbol,
  decodeCrockfordBase32,
  encodeCrockfordBase32,
  verifyCrockfordCheck,
} from './src/crockford.ts';
import {
  decodeFarmCodeBytes,
  encodeFarmCodeFromBytes,
  FARM_CODE_PAYLOAD_LEN,
  FARM_CODE_RAW_BYTES,
  formatFarmCode,
  isValidFarmCode,
  mintFarmCode,
  parseFarmCode,
} from './src/farm-code.ts';
import { bytesToHex, deriveFarmId, deriveFarmSeed, hexToBytes } from './src/farm-seed.ts';

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

describe('FarmCode mist-fc-1', () => {
  const sampleBytes = hexToBytes('7a9c3e1f4b8d2a6c5e0f1d3b7a9c4e2f');

  it('encodes bytes to grouped mist-fc-1 form', () => {
    const formatted = encodeFarmCodeFromBytes(sampleBytes);
    expect(formatted.startsWith('mist-fc-1  ')).toBe(true);
    expect(formatted.split('-').length).toBeGreaterThanOrEqual(5);
  });

  it('round-trips encode → decode → same bytes', () => {
    const formatted = encodeFarmCodeFromBytes(sampleBytes);
    const decoded = decodeFarmCodeBytes(formatted);
    expect(bytesToHex(decoded)).toBe(bytesToHex(sampleBytes));
  });

  it('rejects wrong check character', () => {
    const formatted = encodeFarmCodeFromBytes(sampleBytes);
    const body = formatted.replace(/^mist-fc-1\s+/, '').replace(/-/g, '');
    const bad = formatFarmCode(body.slice(0, -1) + (body.endsWith('0') ? '1' : '0'));
    expect(isValidFarmCode(bad)).toBe(false);
    expect(() => decodeFarmCodeBytes(bad)).toThrow(/check character/i);
  });

  it('rejects unknown version prefix', () => {
    const formatted = encodeFarmCodeFromBytes(sampleBytes).replace('mist-fc-1', 'mist-fc-2');
    expect(() => decodeFarmCodeBytes(formatted)).toThrow(/unsupported|unknown/i);
  });

  it('mints valid codes', async () => {
    const code = await mintFarmCode();
    expect(isValidFarmCode(code)).toBe(true);
    const parsed = await parseFarmCode(code);
    expect(parsed.bytes.length).toBe(FARM_CODE_RAW_BYTES);
    expect(parsed.farmId).toMatch(/^[0-9a-f]{32}$/);
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

  it('matches plan illustrative layout prefix and grouping', () => {
    const illustrative =
      'mist-fc-1  7K9M-NPQR-STVW-XY2Z-4GHJ-KMNP-C';
    expect(illustrative.startsWith('mist-fc-1')).toBe(true);
    expect(illustrative.includes('-')).toBe(true);
    const minted = encodeFarmCodeFromBytes(new Uint8Array(16));
    expect(minted.startsWith('mist-fc-1')).toBe(true);
    expect(decodeFarmCodeBytes(minted).length).toBe(FARM_CODE_RAW_BYTES);
  });
});
