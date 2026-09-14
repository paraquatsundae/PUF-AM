/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  clearFreenetHostHoldOff,
  FREENET_HOST_HOLD_OFF_KEY,
  isFreenetHostHoldOff,
  releaseFreenetHostHoldOffOnFarmChange,
  setFreenetHostHoldOff,
} from './freenetHostHoldOff.ts';

afterEach(() => {
  sessionStorage.clear();
});

describe('freenetHostHoldOff', () => {
  it('pauses want until Start or a farm change', () => {
    expect(isFreenetHostHoldOff()).toBe(false);
    setFreenetHostHoldOff(true);
    expect(isFreenetHostHoldOff()).toBe(true);
    expect(sessionStorage.getItem(FREENET_HOST_HOLD_OFF_KEY)).toBe('1');
    clearFreenetHostHoldOff();
    expect(isFreenetHostHoldOff()).toBe(false);
  });

  it('releases hold-off when leaving or switching farms, not on the same farm', () => {
    setFreenetHostHoldOff(true);
    expect(releaseFreenetHostHoldOffOnFarmChange('mist-1', 'mist-1')).toBe(false);
    expect(isFreenetHostHoldOff()).toBe(true);
    expect(releaseFreenetHostHoldOffOnFarmChange('mist-1', null)).toBe(true);
    expect(isFreenetHostHoldOff()).toBe(false);
    setFreenetHostHoldOff(true);
    expect(releaseFreenetHostHoldOffOnFarmChange('mist-1', 'mist-2')).toBe(true);
    expect(isFreenetHostHoldOff()).toBe(false);
  });
});
