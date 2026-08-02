import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  encodeFarmCodeFromBytes,
  normalizeFarmCodeInput,
  parseFarmCode,
} from '../../units/mist-freenet/src/index.ts';
import { hexToBytes } from '../../units/mist-freenet/src/farm-seed.ts';
import {
  clearMistDeviceSession,
  createMistSessionRecord,
  loadMistDeviceSession,
  saveMistDeviceSession,
} from './mistDeviceSession.ts';

const mockStorage = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (k: string) => mockStorage.get(k) ?? null,
  setItem: (k: string, v: string) => {
    mockStorage.set(k, v);
  },
  removeItem: (k: string) => {
    mockStorage.delete(k);
  },
  clear: () => mockStorage.clear(),
  key: () => null,
  length: 0,
});

/** Fixed vector — recover path must match mint/parse derivation. */
const KNOWN_BYTES = hexToBytes('7a9c3e1f4b8d2a6c5e0f1d3b7a9c4e2f');
const KNOWN_FARM_CODE = encodeFarmCodeFromBytes(KNOWN_BYTES);
const EXPECTED_FARM_SEED = 'ba5321465c872085aa7b70be572e0aa46b49188b6bb9e05677ddb2931da81c41';
const EXPECTED_FARM_ID = '098b7877a1d5a1bd04dc5ab0fd9dfb7d';

const nativeCrypto = globalThis.crypto;

function stubNoSubtleCrypto(): void {
  vi.stubGlobal('crypto', {
    ...nativeCrypto,
    subtle: undefined,
    getRandomValues: nativeCrypto.getRandomValues.bind(nativeCrypto),
  });
}

describe('mist FarmCode recovery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mockStorage.set(k, v);
      },
      removeItem: (k: string) => {
        mockStorage.delete(k);
      },
      clear: () => mockStorage.clear(),
      key: () => null,
      length: 0,
    });
    mockStorage.clear();
    clearMistDeviceSession();
  });

  it('recover parse derives same farmId as mint path for known vector', async () => {
    const mintParsed = await parseFarmCode(KNOWN_FARM_CODE);
    const recoverParsed = await parseFarmCode(KNOWN_FARM_CODE);

    expect(recoverParsed.farmId).toBe(mintParsed.farmId);
    expect(recoverParsed.farmId).toBe(EXPECTED_FARM_ID);
    expect(recoverParsed.farmId).toMatch(/^[0-9a-f]{32}$/);
    expect(recoverParsed.farmSeed).toEqual(mintParsed.farmSeed);
    expect([...recoverParsed.farmSeed].map((b) => b.toString(16).padStart(2, '0')).join('')).toBe(
      EXPECTED_FARM_SEED,
    );
  });

  it('parseFarmCode works when crypto.subtle is unavailable (LAN HTTP)', async () => {
    stubNoSubtleCrypto();
    const parsed = await parseFarmCode(KNOWN_FARM_CODE);
    expect(parsed.farmId).toBe(EXPECTED_FARM_ID);
  });

  it('session save fails with actionable error when crypto.subtle missing', async () => {
    const parsed = await parseFarmCode(KNOWN_FARM_CODE);
    const session = createMistSessionRecord({
      farmId: parsed.farmId,
      farmName: 'Recovered farm',
      displayName: 'Laptop B',
      farmSeed: parsed.farmSeed,
    });

    stubNoSubtleCrypto();
    await expect(saveMistDeviceSession(session)).rejects.toThrow(/localhost:3000|LAN IP|HTTPS/i);
  });

  it('recover accepts messy pasted FarmCode from paper wallet', async () => {
    const wrapped = KNOWN_FARM_CODE.replace(/(.{30})/, '$1\n');
    const spacedHyphens = KNOWN_FARM_CODE.replace(/-/g, ' - ');
    const bodyOnly = KNOWN_FARM_CODE.replace(/^mist-fc-1\s+/, '');

    for (const messy of [wrapped, spacedHyphens, bodyOnly, `FarmCode: ${KNOWN_FARM_CODE}`]) {
      expect(normalizeFarmCodeInput(messy)).toBe(KNOWN_FARM_CODE);
      const parsed = await parseFarmCode(messy);
      expect(parsed.farmId).toBe((await parseFarmCode(KNOWN_FARM_CODE)).farmId);
    }
  });

  it('recovered session persists and reloads with same farmId', async () => {
    const parsed = await parseFarmCode(KNOWN_FARM_CODE);
    const session = createMistSessionRecord({
      farmId: parsed.farmId,
      farmName: 'Recovered farm',
      displayName: 'Laptop B',
      farmSeed: parsed.farmSeed,
    });

    await saveMistDeviceSession(session);
    const loaded = await loadMistDeviceSession();

    expect(loaded?.farmId).toBe(parsed.farmId);
    expect(loaded?.displayName).toBe('Laptop B');
    expect(loaded?.farmSeedHex).toHaveLength(64);
  });
});
