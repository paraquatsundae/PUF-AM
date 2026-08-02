import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bytesToHex,
  deriveFarmId,
  deriveFarmSeed,
  hexToBytes,
  hkdfSha256,
} from './src/farm-seed.ts';

/** Web Crypto reference for sample FarmCode bytes (mist-fc-1 test vector). */
const SAMPLE_BYTES = hexToBytes('7a9c3e1f4b8d2a6c5e0f1d3b7a9c4e2f');
const EXPECTED_FARM_SEED = 'ba5321465c872085aa7b70be572e0aa46b49188b6bb9e05677ddb2931da81c41';
const EXPECTED_FARM_ID = '098b7877a1d5a1bd04dc5ab0fd9dfb7d';

async function hkdfViaSubtle(
  ikm: Uint8Array,
  salt: string,
  info: string,
  length: number,
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle!.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle!.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: enc.encode(salt),
      info: enc.encode(info),
    },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

describe('hkdfSha256 pure JS', () => {
  it('matches Web Crypto for farm-seed and farm-id vectors', async () => {
    const jsSeed = await hkdfSha256(SAMPLE_BYTES, 'pufam-mist-v1', 'farm-seed', 32);
    expect(bytesToHex(jsSeed)).toBe(EXPECTED_FARM_SEED);

    const jsFarmIdBytes = await hkdfSha256(jsSeed, 'pufam-mist-v1', 'farm-id', 16);
    expect(bytesToHex(jsFarmIdBytes)).toBe(EXPECTED_FARM_ID);

    if (crypto.subtle) {
      const subtleSeed = await hkdfViaSubtle(SAMPLE_BYTES, 'pufam-mist-v1', 'farm-seed', 32);
      expect(bytesToHex(subtleSeed)).toBe(bytesToHex(jsSeed));

      const subtleFarmId = await hkdfViaSubtle(subtleSeed, 'pufam-mist-v1', 'farm-id', 16);
      expect(bytesToHex(subtleFarmId)).toBe(bytesToHex(jsFarmIdBytes));
    }
  });

  it('deriveFarmSeed / deriveFarmId match fixed vectors without crypto.subtle', async () => {
    const savedSubtle = crypto.subtle;
    vi.stubGlobal('crypto', { ...crypto, subtle: undefined });

    try {
      const seed = await deriveFarmSeed(SAMPLE_BYTES);
      expect(bytesToHex(seed)).toBe(EXPECTED_FARM_SEED);

      const farmId = await deriveFarmId(seed);
      expect(farmId).toBe(EXPECTED_FARM_ID);
    } finally {
      vi.stubGlobal('crypto', { ...crypto, subtle: savedSubtle });
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});
