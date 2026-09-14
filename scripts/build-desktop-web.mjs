/**
 * Build the Vite web bundle for the desktop shell.
 *
 * `npm run build` alone is not enough. The mist/Freenet workshop UI is gated on
 * `import.meta.env.VITE_MIST_EXPERIMENTAL`, which Vite *inlines at build time* —
 * an unset flag is replaced with `undefined` and the gate is dead-code eliminated.
 * The `MIST_FREENET=1` an operator passes to the packaged app starts the Freenet
 * node but cannot reach a bundle that was already compiled with the gate off, so
 * the desktop build bakes the flag in here.
 *
 * Freenet Sync is experimental, not workshop. Dist bakes
 * `VITE_MIST_EXPERIMENTAL=true` the same way the APK does — a stray
 * `VITE_MIST_EXPERIMENTAL=false` in the shell must not drop the gate
 * (`Plans/NAMING.md` §3). Pass `--no-mist` for a Firebase-only desktop build.
 *
 * `VITE_WORKSHOP_MODE` is forced off so a local `.env` cannot fold the
 * workshop banner / fake admin into an AppImage (same hole as the APK bake).
 *
 * Plan: `Plans/reference/DESKTOP_FREENET_PLUGIN.md` §8.3.
 */

import { build } from 'vite';

process.env.VITE_WORKSHOP_MODE = 'false';

if (process.argv.includes('--no-mist')) {
  process.env.VITE_MIST_EXPERIMENTAL = 'false';
} else {
  process.env.VITE_MIST_EXPERIMENTAL = 'true';
}

console.log(
  `[desktop] web build — VITE_MIST_EXPERIMENTAL=${process.env.VITE_MIST_EXPERIMENTAL} VITE_WORKSHOP_MODE=${process.env.VITE_WORKSHOP_MODE}`,
);

await build();
