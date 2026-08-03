/**
 * Bundle the Electron main and preload processes.
 *
 * Electron cannot execute TypeScript and this repo uses `.ts` import specifiers,
 * so `desktop/`, `server/`, `units/`, and `shared/` are bundled ahead of launch.
 *
 * npm dependencies stay **external**: Electron resolves them from `node_modules`
 * as usual. Flattening them in would mean bundling `firebase-admin`'s dynamic
 * requires and grpc's native bindings, which is a packaging problem we do not
 * need — the TypeScript is the only thing Electron genuinely cannot load.
 *
 * CJS output on purpose: no ESM/`__dirname` friction in Electron main.
 * Plan: `Plans/DESKTOP_FREENET_PLUGIN.md` §8.3.
 */

import { build } from 'esbuild';

const IMPORT_META_URL_SHIM = '__pufImportMetaUrl';

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
  // `import.meta` is empty in a CJS bundle, and `units/mist-freenet` reads
  // `import.meta.url` at module load to locate its pack contract. Without this the
  // bundle throws on import. `desktop/main.ts` still sets FREENET_PACK_WASM
  // explicitly, because the shimmed path points at the bundle, not the asset.
  define: { 'import.meta.url': IMPORT_META_URL_SHIM },
  banner: {
    js: `const ${IMPORT_META_URL_SHIM} = require('node:url').pathToFileURL(__filename).href;`,
  },
};

await Promise.all([
  build({ ...shared, entryPoints: ['desktop/main.ts'], outfile: 'desktop/build/main.cjs' }),
  build({ ...shared, entryPoints: ['desktop/preload.ts'], outfile: 'desktop/build/preload.cjs' }),
]);
