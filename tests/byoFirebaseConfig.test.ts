import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  BYO_DEFAULT_DATABASE,
  BYO_STORAGE_KEY,
  PUFWORKS_PROJECT_ID,
  clearByoFirebase,
  parseByoConfigError,
  parseByoFirebaseConfig,
  persistByoFirebase,
  readStoredByoFirebase,
} from '../src/lib/byoFirebaseConfig';

const validPaste = `{
  "apiKey": "AIzaSyTestKey00000000000000000000000",
  "authDomain": "my-farm.firebaseapp.com",
  "projectId": "my-farm-project",
  "appId": "1:123:web:abc",
  "storageBucket": "my-farm.appspot.com"
}`;

describe('parseByoFirebaseConfig', () => {
  it('accepts console JSON and forces the default database', () => {
    const result = parseByoFirebaseConfig(validPaste);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.projectId).toBe('my-farm-project');
    expect(result.config.firestoreDatabaseId).toBe(BYO_DEFAULT_DATABASE);
    expect(result.namedDatabaseDropped).toBe(false);
  });

  it('pulls the object out of a JS snippet', () => {
    const result = parseByoFirebaseConfig(`const firebaseConfig = ${validPaste};`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.appId).toBe('1:123:web:abc');
  });

  it('drops a named database and says so', () => {
    const result = parseByoFirebaseConfig(
      JSON.stringify({
        apiKey: 'k',
        authDomain: 'x.firebaseapp.com',
        projectId: 'other-project',
        appId: '1:1:web:x',
        firestoreDatabaseId: 'named-db',
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.namedDatabaseDropped).toBe(true);
    expect(result.config.firestoreDatabaseId).toBe(BYO_DEFAULT_DATABASE);
  });

  it('refuses the PUFworks project', () => {
    const result = parseByoFirebaseConfig(
      JSON.stringify({
        apiKey: 'k',
        authDomain: 'x.firebaseapp.com',
        projectId: PUFWORKS_PROJECT_ID,
        appId: '1:1:web:x',
      })
    );
    expect(result.ok).toBe(false);
    expect(parseByoConfigError(result)).toMatch(/PUFworks project/);
  });

  it('rejects empty or incomplete pastes', () => {
    expect(parseByoFirebaseConfig('').ok).toBe(false);
    expect(parseByoFirebaseConfig('{"projectId":"x"}').ok).toBe(false);
  });
});

describe('BYO config storage', () => {
  const memory = new Map<string, string>();

  beforeEach(() => {
    memory.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => memory.get(k) ?? null,
        setItem: (k: string, v: string) => void memory.set(k, v),
        removeItem: (k: string) => void memory.delete(k),
      },
    });
  });

  afterEach(() => {
    clearByoFirebase();
  });

  it('round-trips a saved config and refuses to persist PUFworks', () => {
    const parsed = parseByoFirebaseConfig(validPaste);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    persistByoFirebase(parsed.config, '2026-08-13T00:00:00.000Z');
    const stored = readStoredByoFirebase();
    expect(stored?.config.projectId).toBe('my-farm-project');
    expect(stored?.billingAck.at).toBe('2026-08-13T00:00:00.000Z');
    expect(() =>
      persistByoFirebase({ ...parsed.config, projectId: PUFWORKS_PROJECT_ID })
    ).toThrow(/PUFworks/);
    expect(localStorage.getItem(BYO_STORAGE_KEY)).toContain('my-farm-project');
  });
});
