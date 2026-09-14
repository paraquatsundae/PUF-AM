/**
 * @vitest-environment jsdom
 *
 * AppImage / APK adopt a leftover Freenet-native seed so Settings XOR and the
 * 20 s watch match the phone. Hosted web must not.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §1
 * @see Plans/FREENET_OPERATOR_FLOW.md Decision 2026-09-14 (AppImage Freenet Sync visible)
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getFarmStoreBackend, setFarmStoreBackend } from './farmStoreBackend.ts';
import {
  adoptFreenetNativeSessionIfPresent,
  canAdoptFreenetNativeSession,
  isMistFarmSessionActive,
} from './mistFarmSession.ts';
import { shouldRunFreenetHotWatch, showFreenetFarmTools } from '../lib/farmPipes.ts';

function seedNative(meta: Record<string, unknown> = {}) {
  localStorage.setItem('pufam.mist.session.v1', '{"v":1,"mode":"device","iv":"00","ct":"00"}');
  localStorage.setItem(
    'pufam.mist.sessionMeta.v1',
    JSON.stringify({
      farmId: 'mist-clare',
      farmName: 'ClareDowns',
      displayName: 'G',
      hasDevicePin: false,
      role: 'owner',
      ...meta,
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  setFarmStoreBackend('firebase');
});

afterEach(() => localStorage.clear());

describe('canAdoptFreenetNativeSession', () => {
  it('is for AppImage and APK, not hosted web', () => {
    expect(canAdoptFreenetNativeSession({ desktop: true, native: false })).toBe(true);
    expect(canAdoptFreenetNativeSession({ desktop: false, native: true })).toBe(true);
    expect(canAdoptFreenetNativeSession({ desktop: false, native: false })).toBe(false);
  });
});

describe('adoptFreenetNativeSessionIfPresent', () => {
  it('does nothing on hosted web with a leftover seed', () => {
    seedNative();
    expect(adoptFreenetNativeSessionIfPresent({ desktop: false, native: false })).toBe(false);
    expect(getFarmStoreBackend()).toBe('firebase');
    expect(isMistFarmSessionActive()).toBe(false);
    expect(shouldRunFreenetHotWatch()).toBe(false);
  });

  it('does not steal a hybrid member seed (cloudFarmId stays firebase)', () => {
    seedNative({ cloudFarmId: 'farm_76c27adef98b836c' });
    expect(adoptFreenetNativeSessionIfPresent({ desktop: true, native: false })).toBe(false);
    expect(getFarmStoreBackend()).toBe('firebase');
  });

  it('AppImage leftover Freenet farm becomes the login — Sync card + watch', () => {
    seedNative();
    expect(isMistFarmSessionActive()).toBe(false);
    expect(adoptFreenetNativeSessionIfPresent({ desktop: true, native: false })).toBe(true);
    expect(getFarmStoreBackend()).toBe('mist');
    expect(isMistFarmSessionActive()).toBe(true);
    expect(shouldRunFreenetHotWatch()).toBe(true);
    expect(showFreenetFarmTools()).toBe(true);
  });

  it('APK leftover Freenet farm adopts the same way', () => {
    seedNative();
    expect(adoptFreenetNativeSessionIfPresent({ desktop: false, native: true })).toBe(true);
    expect(isMistFarmSessionActive()).toBe(true);
  });

  it('is a no-op when the backend is already mist', () => {
    seedNative();
    setFarmStoreBackend('mist');
    expect(adoptFreenetNativeSessionIfPresent({ desktop: true, native: false })).toBe(true);
    expect(getFarmStoreBackend()).toBe('mist');
  });
});
