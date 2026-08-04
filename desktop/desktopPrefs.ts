/**
 * Operator preferences the *main* process has to know before a window exists.
 *
 * The mist opt-in decides whether a Freenet node is spawned at launch, which
 * happens long before the renderer (and its `localStorage`) is alive — so it
 * cannot live where the rest of the app's preferences live. A small JSON file
 * under `userData` is the whole mechanism.
 *
 * Imports nothing from `electron` so it stays testable in plain Node; `main.ts`
 * supplies the path. See `Plans/DESKTOP_FREENET_PLUGIN.md` §9 and §14 Phase 4.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const DESKTOP_PREFS_FILENAME = 'desktop-prefs.json';

export type DesktopPrefs = {
  /** Start the app-owned Freenet node at launch and show the mist surfaces. */
  mistEnabled: boolean;
};

export const DESKTOP_PREFS_DEFAULT: DesktopPrefs = { mistEnabled: false };

export function desktopPrefsPath(userDataDir: string): string {
  return path.join(userDataDir, DESKTOP_PREFS_FILENAME);
}

/**
 * Never throws. A missing file is the normal first-launch case, and a corrupt
 * one must degrade to "mist off" rather than stop the app booting — off is the
 * safe direction, because it is the Firebase default path.
 */
export function readDesktopPrefs(file: string): DesktopPrefs {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<DesktopPrefs> | null;
    return { mistEnabled: parsed?.mistEnabled === true };
  } catch {
    return { ...DESKTOP_PREFS_DEFAULT };
  }
}

/** Returns the normalised prefs so main can hold exactly what is on disk. */
export function writeDesktopPrefs(file: string, prefs: DesktopPrefs): DesktopPrefs {
  const next: DesktopPrefs = { mistEnabled: prefs.mistEnabled === true };
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  } catch {
    // An unwritable userData dir costs the operator the preference at next
    // launch, not this session — the caller has already acted on it.
  }
  return next;
}
