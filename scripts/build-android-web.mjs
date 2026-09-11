/**
 * Build the Vite web bundle for the Capacitor Android shell.
 *
 * The Android sibling of `build-desktop-web.mjs`, and it exists for the same
 * reason. `isMistExperimentalEnabled()` reads `import.meta.env.VITE_MIST_EXPERIMENTAL`,
 * which Vite *inlines at build time* — an unset flag becomes `undefined` and the
 * mist start-screen chooser is dead-code eliminated. There is no Android
 * equivalent of the desktop preload bridge to bring it back at runtime, so if
 * the flag is not baked here the APK simply has no mist UI, whatever the tablet
 * is later told.
 *
 * `VITE_CAPACITOR=1` is what makes Vite emit relative asset paths, which the
 * packaged WebView needs.
 *
 * Firebase-only APK (production shape):  VITE_MIST_EXPERIMENTAL=false
 *
 * `VITE_WORKSHOP_MODE` is forced off. Vite inlines any `VITE_*` already in
 * `process.env` or a local `.env`; a workshop machine's `.env` with `true`
 * would otherwise bake the orange banner and the fake signed-in admin into
 * every APK. Process env beats `.env`, so this assignment wins. Workshop UI
 * stays on `npm run dev`. See `Plans/NAMING.md` §3.
 *
 * Plan: `Plans/reference/APK_FREENET_PLUGIN.md` §6.
 */

import { build } from 'vite';

process.env.VITE_CAPACITOR = '1';
process.env.VITE_WORKSHOP_MODE = 'false';

if (process.argv.includes('--no-mist')) {
  process.env.VITE_MIST_EXPERIMENTAL = 'false';
} else if (process.env.VITE_MIST_EXPERIMENTAL === undefined) {
  process.env.VITE_MIST_EXPERIMENTAL = 'true';
}

console.log(
  `[android] web build — VITE_CAPACITOR=1 VITE_MIST_EXPERIMENTAL=${process.env.VITE_MIST_EXPERIMENTAL} VITE_WORKSHOP_MODE=${process.env.VITE_WORKSHOP_MODE}`,
);

await build();
