import { describe, expect, it } from 'vitest';

import { shouldOfferFarmCodePrompt } from './shouldOfferFarmCodePrompt.ts';

const base = {
  enabled: true,
  farmId: 'farm_abc',
  seedCloudFarmId: null as string | null,
  capability: 'electron' as const,
  dismissed: false,
};

describe('shouldOfferFarmCodePrompt', () => {
  it('offers when enabled, no seed here, electron, not dismissed', () => {
    expect(shouldOfferFarmCodePrompt(base)).toBe(true);
  });

  it('hides when the mirror is off', () => {
    expect(shouldOfferFarmCodePrompt({ ...base, enabled: false })).toBe(false);
  });

  it('hides when this device already holds the seed', () => {
    expect(shouldOfferFarmCodePrompt({ ...base, seedCloudFarmId: 'farm_abc' })).toBe(false);
  });

  it('hides without a host adapter', () => {
    expect(shouldOfferFarmCodePrompt({ ...base, capability: null })).toBe(false);
  });

  it('offers on an Android host the same as Electron', () => {
    expect(shouldOfferFarmCodePrompt({ ...base, capability: 'android' })).toBe(true);
  });

  it('hides when dismissed', () => {
    expect(shouldOfferFarmCodePrompt({ ...base, dismissed: true })).toBe(false);
  });
});
