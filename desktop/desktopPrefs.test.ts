import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DESKTOP_PREFS_FILENAME,
  desktopPrefsPath,
  readDesktopPrefs,
  writeDesktopPrefs,
} from './desktopPrefs.ts';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'pufam-prefs-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('desktop preferences', () => {
  it('defaults mist off when nothing has been saved', () => {
    expect(readDesktopPrefs(desktopPrefsPath(dir))).toEqual({ mistEnabled: false });
  });

  it('round-trips the mist opt-in', () => {
    const file = desktopPrefsPath(dir);
    expect(writeDesktopPrefs(file, { mistEnabled: true })).toEqual({ mistEnabled: true });
    expect(readDesktopPrefs(file)).toEqual({ mistEnabled: true });

    writeDesktopPrefs(file, { mistEnabled: false });
    expect(readDesktopPrefs(file)).toEqual({ mistEnabled: false });
  });

  it('creates the directory the first time', () => {
    const file = desktopPrefsPath(path.join(dir, 'nested', 'userData'));
    writeDesktopPrefs(file, { mistEnabled: true });
    expect(readDesktopPrefs(file)).toEqual({ mistEnabled: true });
  });

  it('falls back to mist off on a corrupt file rather than failing the boot', () => {
    const file = desktopPrefsPath(dir);
    writeFileSync(file, '{ not json', 'utf8');
    expect(readDesktopPrefs(file)).toEqual({ mistEnabled: false });
  });

  it('treats a non-boolean opt-in as off', () => {
    // A hand-edited file must not turn Freenet on by accident.
    const file = desktopPrefsPath(dir);
    writeFileSync(file, JSON.stringify({ mistEnabled: 'yes' }), 'utf8');
    expect(readDesktopPrefs(file)).toEqual({ mistEnabled: false });
  });

  it('names the file predictably so the workshop can inspect it', () => {
    expect(desktopPrefsPath('/home/op/.config/PUF-AM')).toBe(
      `/home/op/.config/PUF-AM/${DESKTOP_PREFS_FILENAME}`,
    );
  });
});
