import { webcrypto } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  clearUnlockPin,
  hasUnlockPin,
  setUnlockPin,
  verifyUnlockPin,
} from '../src/lib/unlockPin';

beforeAll(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
  });
  Object.defineProperty(globalThis, 'localStorage', {
    value: dom.window.localStorage,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: dom.window.sessionStorage,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
});

describe('unlockPin', () => {
  const uid = 'user_test_joe';

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearUnlockPin(uid);
  });

  it('sets and verifies a personal unlock PIN for a uid', async () => {
    await setUnlockPin(uid, '2580');
    expect(hasUnlockPin(uid)).toBe(true);
    expect(await verifyUnlockPin(uid, '2580')).toBe(true);
    expect(await verifyUnlockPin(uid, '0000')).toBe(false);
  });

  it('does not collide across uids with the same PIN digits', async () => {
    const other = 'user_other_joe';
    await setUnlockPin(uid, '2580');
    await setUnlockPin(other, '2580');
    expect(await verifyUnlockPin(uid, '2580')).toBe(true);
    expect(await verifyUnlockPin(other, '2580')).toBe(true);
    clearUnlockPin(other);
    expect(hasUnlockPin(uid)).toBe(true);
    expect(hasUnlockPin(other)).toBe(false);
  });
});
