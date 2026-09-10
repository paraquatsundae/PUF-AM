/**
 * @vitest-environment jsdom
 *
 * Per-farm enable flag for the Freenet network pack
 * (`pufam.networkPacks.v1.{farmId}`, Plans/NAMING.md §5).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  hasFreenetHostChoice,
  isFreenetHostEnabled,
  readNetworkPackFlags,
  setFreenetHostEnabled,
  subscribeFreenetHostEnabled,
} from '../plugins/freenet_host/src/freenetHostEnable.ts';

beforeEach(() => localStorage.clear());

describe('freenetHostEnable', () => {
  it('defaults to enabled for a farm with no record, and false with no farm', () => {
    expect(isFreenetHostEnabled('farm-a')).toBe(true);
    expect(hasFreenetHostChoice('farm-a')).toBe(false);
    expect(isFreenetHostEnabled(null)).toBe(false);
    expect(isFreenetHostEnabled(undefined)).toBe(false);
  });

  it('records a per-farm choice under the NAMING §5 key and notifies subscribers', () => {
    const listener = vi.fn();
    const off = subscribeFreenetHostEnabled(listener);
    setFreenetHostEnabled('farm-a', false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(isFreenetHostEnabled('farm-a')).toBe(false);
    expect(isFreenetHostEnabled('farm-b')).toBe(true);
    expect(hasFreenetHostChoice('farm-a')).toBe(true);
    expect(JSON.parse(localStorage.getItem('pufam.networkPacks.v1.farm-a') ?? '{}')).toMatchObject({
      freenet_host: { enabled: false },
    });
    off();
    setFreenetHostEnabled('farm-a', true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('treats a corrupt record as no record', () => {
    localStorage.setItem('pufam.networkPacks.v1.farm-a', '{nope');
    expect(readNetworkPackFlags('farm-a')).toEqual({});
    expect(isFreenetHostEnabled('farm-a')).toBe(true);
  });
});
