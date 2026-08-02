import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearMistDeviceSession,
  createMistSessionRecord,
  getMistSessionMeta,
  loadMistDeviceSession,
  mistSessionNeedsPin,
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

describe('mistDeviceSession', () => {
  afterEach(() => {
    mockStorage.clear();
    clearMistDeviceSession();
  });

  const sampleSession = () =>
    createMistSessionRecord({
      farmId: 'a'.repeat(32),
      farmName: 'Test Orchard',
      displayName: 'Alice',
      farmSeed: new Uint8Array(32).fill(7),
    });

  it('auto-restores without PIN (device key mode)', async () => {
    const session = sampleSession();
    await saveMistDeviceSession(session);

    expect(mistSessionNeedsPin()).toBe(false);
    const loaded = await loadMistDeviceSession();
    expect(loaded?.farmName).toBe('Test Orchard');
    expect(loaded?.farmSeedHex).toHaveLength(64);
    expect(getMistSessionMeta()?.displayName).toBe('Alice');
  });

  it('requires PIN to decrypt when device PIN was set', async () => {
    const session = createMistSessionRecord({
      farmId: 'b'.repeat(32),
      farmName: 'PIN Farm',
      displayName: 'Bob',
      farmSeed: new Uint8Array(32).fill(3),
      devicePin: '1234',
    });
    await saveMistDeviceSession(session, '1234');

    expect(mistSessionNeedsPin()).toBe(true);
    expect(await loadMistDeviceSession()).toBeNull();
    expect(await loadMistDeviceSession('9999')).toBeNull();

    const unlocked = await loadMistDeviceSession('1234');
    expect(unlocked?.farmName).toBe('PIN Farm');
    expect(unlocked?.hasDevicePin).toBe(true);
  });

  it('does not store FarmSeed in plaintext in localStorage blob', async () => {
    const session = createMistSessionRecord({
      farmId: 'c'.repeat(32),
      farmName: 'Secret Farm',
      displayName: 'Carol',
      farmSeed: new Uint8Array(32).fill(9),
      devicePin: '5678',
    });
    await saveMistDeviceSession(session, '5678');

    const raw = mockStorage.get('pufam.mist.session.v1') ?? '';
    expect(raw).not.toContain('"farmSeedHex"');
    expect(raw).not.toContain('090909');
  });
});
