/**
 * Hot watch ping: addressed from HotKey, never FarmSeed.
 * @see Plans/FREENET_OPERATOR_FLOW.md §9.2 Decision 2026-09-12
 */
import { describe, expect, it } from 'vitest';

import { deriveHotContractKey } from './src/hot-crypto.ts';
import {
  assertNoFarmSeedInHotWatch,
  deriveHotWatchSlotAddress,
  hotWatchPingChanged,
  parseHotWatchPing,
  unwrapHotWatchPing,
  wrapHotWatchPing,
  type HotWatchPing,
} from './src/hot-watch.ts';

const FARM_SEED = new Uint8Array(32).fill(13);
const FARM_ID = 'aabbccddeeff0011';

function samplePing(patch?: Partial<HotWatchPing>): HotWatchPing {
  return {
    v: 1,
    kind: 'hot-watch',
    farmId: FARM_ID,
    generation: 100,
    hotUri: 'FN02@hotwatch',
    hotContentHash: 'ab'.repeat(32),
    updatedAt: '2026-09-12T13:00:00.000Z',
    ...patch,
  };
}

describe('hot watch ping', () => {
  it('wraps and unwraps with HotKey only', async () => {
    const hotKey = await deriveHotContractKey(FARM_SEED);
    const sealed = await wrapHotWatchPing(samplePing(), hotKey);
    expect(new TextDecoder().decode(sealed)).not.toContain('farmSeed');
    expect(new TextDecoder().decode(sealed)).not.toContain('aabbccddeeff');
    const opened = await unwrapHotWatchPing(sealed, hotKey);
    expect(opened.hotUri).toBe('FN02@hotwatch');
    expect(opened.generation).toBe(100);
    expect(opened.farmId).toBe(FARM_ID);
  });

  it('derives the same slot address from the same HotKey', async () => {
    const hotKey = await deriveHotContractKey(FARM_SEED);
    const a = await deriveHotWatchSlotAddress(hotKey);
    const b = await deriveHotWatchSlotAddress(hotKey);
    expect(a.instanceIdBase58).toBe(b.instanceIdBase58);
    expect(a.uri.startsWith('FN02@')).toBe(true);
  });

  it('refuses a ping that carries FarmSeed', () => {
    expect(() =>
      assertNoFarmSeedInHotWatch({ ...samplePing(), farmSeedHex: 'aa'.repeat(32) }),
    ).toThrow(/FarmSeed/);
    expect(parseHotWatchPing({ ...samplePing(), farmSeed: 'nope' })).toBeNull();
  });

  it('treats a matching hash as no change (cheap ping)', () => {
    const remote = samplePing({ generation: 999 });
    expect(
      hotWatchPingChanged({ generation: 1, hotContentHash: remote.hotContentHash }, remote),
    ).toBe(false);
  });

  it('treats a new hash as a change even if generation did not move', () => {
    expect(
      hotWatchPingChanged(
        { generation: 100, hotContentHash: 'cd'.repeat(32) },
        samplePing({ generation: 100 }),
      ),
    ).toBe(true);
  });
});
