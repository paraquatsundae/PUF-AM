import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  canShowWelcomeBack,
  markDeviceRemembered,
} from './deviceSession.ts';
import {
  isHybridMemberDevice,
  leaveFarmSession,
  loginStepAfterLeaveFarmSession,
} from './leaveFarmSession.ts';
import { getFarmStoreBackend, setFarmStoreBackend } from '../mist/farmStoreBackend.ts';
import {
  clearMistDeviceSession,
  createMistSessionRecord,
  hasMistDeviceSession,
  saveMistDeviceSession,
} from '../mist/mistDeviceSession.ts';

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

vi.stubGlobal('sessionStorage', {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  clear: () => undefined,
  key: () => null,
  length: 0,
});

describe('leaveFarmSession', () => {
  afterEach(() => {
    mockStorage.clear();
    clearMistDeviceSession();
    setFarmStoreBackend('firebase');
  });

  it('clears welcome-back so /login opens on Join, not the PIN bounce', () => {
    markDeviceRemembered('George', { farmId: 'farm_abc', farmName: 'Shed' });
    setFarmStoreBackend('firebase');
    expect(canShowWelcomeBack()).toBe(true);

    const left = leaveFarmSession();

    expect(left.clearedMistLogin).toBe(false);
    expect(left.keptHybridSeed).toBe(false);
    expect(canShowWelcomeBack()).toBe(false);
    expect(loginStepAfterLeaveFarmSession()).toBe('join');
    expect(getFarmStoreBackend()).toBe('firebase');
  });

  it('lets a mist farm session leave without re-entering mist', async () => {
    setFarmStoreBackend('mist');
    await saveMistDeviceSession(
      createMistSessionRecord({
        farmId: 'a'.repeat(32),
        farmName: 'Mist Orchard',
        displayName: 'Alice',
        farmSeed: new Uint8Array(32).fill(7),
      }),
    );
    markDeviceRemembered('Alice', { farmId: 'a'.repeat(32), farmName: 'Mist Orchard' });
    expect(hasMistDeviceSession()).toBe(true);
    expect(canShowWelcomeBack()).toBe(true);

    const left = leaveFarmSession();

    expect(left.clearedMistLogin).toBe(true);
    expect(left.keptHybridSeed).toBe(false);
    expect(hasMistDeviceSession()).toBe(false);
    expect(canShowWelcomeBack()).toBe(false);
    expect(getFarmStoreBackend()).toBe('firebase');
    expect(loginStepAfterLeaveFarmSession()).toBe('join');
  });

  it('keeps a hybrid member seed and still lands on Join', async () => {
    setFarmStoreBackend('firebase');
    await saveMistDeviceSession(
      createMistSessionRecord({
        farmId: 'b'.repeat(32),
        farmName: 'Mirror',
        displayName: 'Bob',
        farmSeed: new Uint8Array(32).fill(3),
        cloudFarmId: 'farm_cloud_1',
      }),
    );
    markDeviceRemembered('Bob', { farmId: 'farm_cloud_1', farmName: 'Cloud farm' });
    expect(isHybridMemberDevice()).toBe(true);

    const left = leaveFarmSession();

    expect(left.clearedMistLogin).toBe(false);
    expect(left.keptHybridSeed).toBe(true);
    expect(hasMistDeviceSession()).toBe(true);
    expect(canShowWelcomeBack()).toBe(false);
    expect(getFarmStoreBackend()).toBe('firebase');
    expect(loginStepAfterLeaveFarmSession()).toBe('join');
  });

  it('clears a leftover mist backend preference so experimental UI does not reopen', () => {
    setFarmStoreBackend('mist');
    markDeviceRemembered('Cara', { farmId: 'farm_x', farmName: 'X' });

    const left = leaveFarmSession();

    expect(left.clearedMistLogin).toBe(false);
    expect(getFarmStoreBackend()).toBe('firebase');
    expect(loginStepAfterLeaveFarmSession()).toBe('join');
  });
});
