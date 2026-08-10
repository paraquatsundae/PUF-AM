import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DESKTOP_PREFS_DEFAULT,
  DESKTOP_PREFS_FILENAME,
  desktopPrefsPath,
  readDesktopPrefs,
  writeDesktopPrefs,
  type DesktopPrefs,
} from './desktopPrefs.ts';
import { LAN_HUB_DEFAULT_PORT } from './lanHubAuth.ts';
import { APP_LOCAL_PORT_DEFAULT } from './localApiPort.ts';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'pufam-prefs-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function prefs(patch: Partial<DesktopPrefs>): DesktopPrefs {
  return { ...DESKTOP_PREFS_DEFAULT, lanHubDevices: [], ...patch };
}

const TOKEN_HASH = 'a'.repeat(64);

describe('desktop preferences', () => {
  it('defaults mist off and the LAN hub on when nothing has been saved', () => {
    // Serving the Wi‑Fi rung is the cheap side; a laptop nothing can find is
    // the expensive one. Freenet stays opt-in — that spawns a process.
    expect(readDesktopPrefs(desktopPrefsPath(dir))).toEqual({
      mistEnabled: false,
      lanHubEnabled: true,
      lanHubPort: LAN_HUB_DEFAULT_PORT,
      lanHubPairingCode: '',
      lanHubDevices: [],
      // Minted by `main.ts` on first serve, not by a read — see `ensureHubId`.
      lanHubId: '',
      appPort: APP_LOCAL_PORT_DEFAULT,
    });
  });

  it('keeps a hub identity across launches, and drops a junk one', () => {
    // A tablet recognises the hub it paired with by this value, so an identity
    // that changed every launch would ask for a pairing code every morning at the
    // gateway address.
    const file = desktopPrefsPath(dir);
    const hubId = 'b'.repeat(32);
    writeDesktopPrefs(file, prefs({ lanHubId: hubId }));
    expect(readDesktopPrefs(file).lanHubId).toBe(hubId);

    writeDesktopPrefs(file, prefs({ lanHubId: 'not-a-hub-id' }));
    expect(readDesktopPrefs(file).lanHubId).toBe('');
  });

  it('honours an operator who turned the LAN hub off', () => {
    const file = desktopPrefsPath(dir);
    writeDesktopPrefs(file, prefs({ lanHubEnabled: false }));
    expect(readDesktopPrefs(file).lanHubEnabled).toBe(false);
  });

  it('serves the Wi‑Fi rung for a prefs file written before the hub had a default', () => {
    // Every desktop already in a shed has `lanHubEnabled: false` on disk only
    // because that was the old default — but those files were written by the
    // app, so the field is present and its `false` is honoured. A file that
    // predates the field entirely gets the new default.
    const file = desktopPrefsPath(dir);
    writeFileSync(file, JSON.stringify({ mistEnabled: true, lanHubPort: 3000 }), 'utf8');
    expect(readDesktopPrefs(file)).toMatchObject({ mistEnabled: true, lanHubEnabled: true });
  });

  it('round-trips the mist opt-in', () => {
    const file = desktopPrefsPath(dir);
    expect(writeDesktopPrefs(file, prefs({ mistEnabled: true }))).toMatchObject({
      mistEnabled: true,
    });
    expect(readDesktopPrefs(file)).toMatchObject({ mistEnabled: true });

    writeDesktopPrefs(file, prefs({ mistEnabled: false }));
    expect(readDesktopPrefs(file)).toMatchObject({ mistEnabled: false });
  });

  it('creates the directory the first time', () => {
    const file = desktopPrefsPath(path.join(dir, 'nested', 'userData'));
    writeDesktopPrefs(file, prefs({ mistEnabled: true }));
    expect(readDesktopPrefs(file)).toMatchObject({ mistEnabled: true });
  });

  it('falls back to the defaults on a corrupt file rather than failing the boot', () => {
    const file = desktopPrefsPath(dir);
    writeFileSync(file, '{ not json', 'utf8');
    expect(readDesktopPrefs(file)).toMatchObject({ mistEnabled: false, lanHubEnabled: true });
  });

  it('treats a non-boolean mist opt-in as off, and a non-boolean hub opt-out as on', () => {
    // A hand-edited file must not turn Freenet on by accident. The hub is the
    // other way round: only an explicit `false` takes the Wi‑Fi rung away.
    const file = desktopPrefsPath(dir);
    writeFileSync(file, JSON.stringify({ mistEnabled: 'yes', lanHubEnabled: 1 }), 'utf8');
    expect(readDesktopPrefs(file)).toMatchObject({ mistEnabled: false, lanHubEnabled: true });
  });

  it('names the file predictably so the workshop can inspect it', () => {
    expect(desktopPrefsPath('/home/op/.config/PUF-AM')).toBe(
      `/home/op/.config/PUF-AM/${DESKTOP_PREFS_FILENAME}`,
    );
  });

  it('round-trips the LAN hub pairing code and its paired tablets', () => {
    const file = desktopPrefsPath(dir);
    writeDesktopPrefs(
      file,
      prefs({
        lanHubEnabled: true,
        lanHubPort: 3100,
        lanHubPairingCode: 'k7m2-9q4x',
        lanHubDevices: [
          { id: 'dev1', name: 'Shed tablet', tokenHash: TOKEN_HASH, pairedAt: '2026-08-07T00:00:00.000Z' },
        ],
      }),
    );

    const read = readDesktopPrefs(file);
    expect(read.lanHubEnabled).toBe(true);
    expect(read.lanHubPort).toBe(3100);
    // Stored canonically, so what Settings shows and what a tablet types agree.
    expect(read.lanHubPairingCode).toBe('K7M2-9Q4X');
    expect(read.lanHubDevices).toEqual([
      { id: 'dev1', name: 'Shed tablet', tokenHash: TOKEN_HASH, pairedAt: '2026-08-07T00:00:00.000Z' },
    ]);
  });

  it('drops a saved device with no usable token hash', () => {
    // A hand-edited or truncated entry can never authenticate, so keeping it
    // would only make the operator think a tablet is still paired.
    const file = desktopPrefsPath(dir);
    writeFileSync(
      file,
      JSON.stringify({
        lanHubDevices: [
          { id: 'ok', name: 'Tablet', tokenHash: TOKEN_HASH, pairedAt: 'x' },
          { id: 'short', name: 'Tablet', tokenHash: 'abc', pairedAt: 'x' },
          { name: 'no id', tokenHash: TOKEN_HASH, pairedAt: 'x' },
        ],
      }),
      'utf8',
    );
    expect(readDesktopPrefs(file).lanHubDevices.map((d) => d.id)).toEqual(['ok']);
  });

  it('rejects an out-of-range LAN port rather than failing to bind later', () => {
    const file = desktopPrefsPath(dir);
    writeFileSync(file, JSON.stringify({ lanHubPort: 80 }), 'utf8');
    expect(readDesktopPrefs(file).lanHubPort).toBe(LAN_HUB_DEFAULT_PORT);
  });

  it('discards a malformed pairing code so pairing fails closed', () => {
    const file = desktopPrefsPath(dir);
    writeFileSync(file, JSON.stringify({ lanHubPairingCode: 'nope' }), 'utf8');
    expect(readDesktopPrefs(file).lanHubPairingCode).toBe('');
  });

  it('round-trips the UI port so the renderer keeps its storage origin', () => {
    // The port *is* the origin, and the origin is where the mist session and
    // the IndexedDB farm live — losing it is the re-login bug this fixes.
    const file = desktopPrefsPath(dir);
    writeDesktopPrefs(file, prefs({ appPort: 7521 }));
    expect(readDesktopPrefs(file).appPort).toBe(7521);
  });

  it('gives a prefs file from before the port was persisted the stable default', () => {
    const file = desktopPrefsPath(dir);
    writeFileSync(file, JSON.stringify({ mistEnabled: true }), 'utf8');
    expect(readDesktopPrefs(file).appPort).toBe(APP_LOCAL_PORT_DEFAULT);
  });

  it('rejects an unbindable UI port rather than failing the next launch', () => {
    const file = desktopPrefsPath(dir);
    for (const bad of [80, 0, 70000, 'seven', null]) {
      writeFileSync(file, JSON.stringify({ appPort: bad }), 'utf8');
      expect(readDesktopPrefs(file).appPort).toBe(APP_LOCAL_PORT_DEFAULT);
    }
  });
});
