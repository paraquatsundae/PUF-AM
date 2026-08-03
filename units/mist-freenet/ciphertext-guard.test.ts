import { describe, expect, it } from 'vitest';
import { encryptHotBlob, type HotState } from './src/index.ts';
import { assertCiphertextForFreenet, isMistAeadEnvelope } from './src/ciphertext-guard.ts';
import { bonesKey, hotKey } from './src/keys.ts';

const FARM = 'farm-guard-test';
const FARM_SEED = new Uint8Array(32).fill(3);

describe('ciphertext-guard', () => {
  it('detects AEAD envelope', async () => {
    const plain = new TextEncoder().encode(JSON.stringify({ farm_id: FARM, records: [] }));
    const wrapped = await encryptHotBlob(plain, FARM_SEED);
    expect(isMistAeadEnvelope(wrapped)).toBe(true);
  });

  it('rejects plaintext HotState JSON for hot keys', () => {
    const plainHot: HotState = {
      farm_id: FARM,
      window_start: '2026-01-01T00:00:00.000Z',
      records: [],
      tombstones: [],
      last_sealed: null,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(plainHot));
    expect(() => assertCiphertextForFreenet(hotKey(FARM), bytes)).toThrow(/plaintext|AEAD/);
  });

  it('accepts encrypted hot blob', async () => {
    const plainHot: HotState = {
      farm_id: FARM,
      window_start: '2026-01-01T00:00:00.000Z',
      records: [],
      tombstones: [],
      last_sealed: null,
    };
    const wrapped = await encryptHotBlob(new TextEncoder().encode(JSON.stringify(plainHot)), FARM_SEED);
    expect(() => assertCiphertextForFreenet(hotKey(FARM), wrapped)).not.toThrow();
  });

  it('rejects workshop bones plaintext JSON', () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({ v: 1, kind: 'bones-workshop', farmId: FARM }),
    );
    expect(() => assertCiphertextForFreenet(bonesKey(FARM, 'smoke'), bytes)).toThrow(/AEAD/);
  });

  it('allowPlaintext bypasses guard for tests', () => {
    const bytes = new TextEncoder().encode('raw-test-bytes');
    expect(() =>
      assertCiphertextForFreenet(bonesKey(FARM, 'smoke'), bytes, { allowPlaintext: true }),
    ).not.toThrow();
  });
});
