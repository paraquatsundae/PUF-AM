/**
 * Desktop dist must bake mist the same way the APK does (experimental, not
 * workshop). A stray `VITE_MIST_EXPERIMENTAL=false` in the shell used to
 * compile Freenet Sync out of the AppImage.
 *
 * @see Plans/NAMING.md §3
 * @see Plans/reference/DESKTOP_FREENET_PLUGIN.md §8.3
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const desktop = readFileSync(new URL('../scripts/build-desktop-web.mjs', import.meta.url), 'utf8');
const android = readFileSync(new URL('../scripts/build-android-web.mjs', import.meta.url), 'utf8');

describe('desktop web bake vs APK', () => {
  it('forces VITE_MIST_EXPERIMENTAL=true unless --no-mist', () => {
    expect(desktop).toContain("process.argv.includes('--no-mist')");
    expect(desktop).toContain("process.env.VITE_MIST_EXPERIMENTAL = 'true'");
    expect(desktop).toContain("process.env.VITE_WORKSHOP_MODE = 'false'");
    expect(desktop).not.toMatch(
      /if \(process\.env\.VITE_MIST_EXPERIMENTAL === undefined\)/,
    );
  });

  it('matches the APK --no-mist switch', () => {
    expect(android).toContain("process.argv.includes('--no-mist')");
    expect(android).toContain("process.env.VITE_MIST_EXPERIMENTAL = 'true'");
  });
});
