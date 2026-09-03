/**
 * Core codebase health gate (Plans/CODEBASE_HEALTH.md).
 *
 *   npm run audit:codebase
 *
 * Allowed import edges: farmModules → cropPacks → pack UI → nav/App.
 * farmModules must never import cropPacks. AuthContext must never import hooks.
 * Thin SoC greps: src/lib ↛ src/components; pages ↛ Leaflet / turf / Firestore.
 *
 * harvest_drying is only allowed in cropPackMigrate.ts (and tests / health docs).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const NEW_FILE_HARD = 600;
const EXISTING_WARN = 800;
const EXISTING_SPLIT = 1200;

/** Files already over the new-file hard limit — do not grow; split tickets exist. */
const KNOWN_OVERSIZE = new Set([
  'src/components/MistFarmSyncCard.tsx',
  'src/components/MistWorkshopCard.tsx',
]);

const HARVEST_DRYING_ALLOW = [
  'shared/farm/cropPackMigrate.ts',
  'src/lib/cropPackLifecycle.ts',
  'tests/cropPacks.test.ts',
  'tests/codebaseHealth.test.ts',
  'Plans/CODEBASE_HEALTH.md',
  'Plans/CODEBASE_HEALTH_CHECK.md',
  'Plans/CROP_PACK_PLUGIN.md',
  'scripts/audit-codebase.mjs',
];

const SCAN_DIRS = ['src', 'shared', 'server'];
const SKIP_DIR = new Set([
  'node_modules',
  'dist',
  'coverage',
  'mist',
  'units',
]);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'mist') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts') && !name.endsWith('.test.tsx')) {
      out.push(full);
    }
  }
  return out;
}

function lineCount(file) {
  const text = readFileSync(file, 'utf8');
  return text.split(/\r?\n/).length;
}

function fail(msg) {
  console.error(`FAIL  ${msg}`);
}

function warn(msg) {
  console.warn(`WARN  ${msg}`);
}

function ok(msg) {
  console.log(`OK    ${msg}`);
}

function auditSizes() {
  let failed = 0;
  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
  const rows = files
    .map((abs) => {
      const rel = relative(ROOT, abs).replace(/\\/g, '/');
      return { rel, lines: lineCount(abs) };
    })
    .sort((a, b) => b.lines - a.lines);

  console.log('\n== File size ==');
  for (const { rel, lines } of rows.filter((r) => r.lines >= EXISTING_WARN)) {
    console.log(`  ${String(lines).padStart(5)}  ${rel}`);
  }

  for (const { rel, lines } of rows) {
    const known = KNOWN_OVERSIZE.has(rel);
    if (!known && lines > NEW_FILE_HARD) {
      fail(`${rel} is ${lines} lines (new-file hard limit ${NEW_FILE_HARD}). Split it.`);
      failed += 1;
    } else if (known && lines > EXISTING_SPLIT) {
      warn(`${rel} is ${lines} lines (split ticket). Do not add logic except a move-out.`);
    } else if (known && lines > EXISTING_WARN) {
      warn(`${rel} is ${lines} lines (over ${EXISTING_WARN}; known, do not grow).`);
    }
  }
  return failed;
}

function auditHarvestDrying() {
  console.log('\n== leftover harvest_drying ==');
  let failed = 0;
  const roots = ['src', 'shared', 'server', 'tests', 'Plans', 'scripts', 'plugins'];
  const hits = [];

  function scan(dir) {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      if (SKIP_DIR.has(name) || name === 'node_modules') continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (name === 'harvest_drying') {
          hits.push(relative(ROOT, full).replace(/\\/g, '/') + '/');
        }
        scan(full);
      } else if (/\.(ts|tsx|md|mjs|json)$/.test(name)) {
        const text = readFileSync(full, 'utf8');
        if (text.includes('harvest_drying')) {
          hits.push(relative(ROOT, full).replace(/\\/g, '/'));
        }
      }
    }
  }
  for (const d of roots) scan(join(ROOT, d));

  for (const hit of hits) {
    if (HARVEST_DRYING_ALLOW.some((allow) => hit === allow || hit.startsWith(allow))) {
      continue;
    }
    fail(`harvest_drying leftover in ${hit} — only cropPackMigrate.ts may keep the legacy key.`);
    failed += 1;
  }
  if (failed === 0) ok('harvest_drying only in migrate / tests / docs');
  return failed;
}

function auditPackFolders() {
  console.log('\n== Pack folders ==');
  let failed = 0;
  const pluginsDir = join(ROOT, 'plugins');
  const packsDir = join(ROOT, 'src', 'packs');
  const ids = [];
  for (const name of readdirSync(pluginsDir)) {
    if (name.startsWith('_') || name.startsWith('.')) continue;
    const manifest = join(pluginsDir, name, 'plugin.json');
    if (!existsSync(manifest)) continue;
    const json = JSON.parse(readFileSync(manifest, 'utf8'));
    if (json.kind !== 'crop_pack') continue;
    if (json.id !== name) {
      fail(`plugins/${name}/plugin.json id is ${json.id}`);
      failed += 1;
    }
    ids.push(json.id);
    // Every pack finished the Plans/PLUGIN_PACK_LAYOUT.md Phase 1 move, so the
    // new location is now the only one. A pack registering from src/packs/
    // would be a regression, not a leftover.
    if (!existsSync(join(pluginsDir, name, 'src', 'index.ts'))) {
      fail(`missing plugins/${name}/src/index.ts`);
      failed += 1;
    }
    if (existsSync(join(packsDir, name, 'index.ts'))) {
      fail(`src/packs/${name}/index.ts is back — packs register from plugins/<id>/src/`);
      failed += 1;
    }
  }
  ok(`${ids.length} first-party pack folders have UI`);
  return failed;
}

function importSpecifiers(text) {
  const specs = [];
  const re = /(?:\bfrom\s+|import\s*\(\s*|require\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm;
  let m;
  while ((m = re.exec(text))) specs.push(m[1]);
  return specs;
}

function importsSrcComponents(spec) {
  if (spec.startsWith('.') && /(^|\/)components(\/|$)/.test(spec)) return true;
  if (spec === 'src/components' || spec.startsWith('src/components/')) return true;
  if (spec.startsWith('@/') && spec.slice(2).startsWith('components')) return true;
  return false;
}

function isForbiddenPageImport(spec) {
  if (spec === 'leaflet' || spec.startsWith('leaflet/') || spec.startsWith('leaflet-') || spec.startsWith('leaflet.')) {
    return 'Leaflet';
  }
  if (spec === 'react-leaflet' || spec.startsWith('react-leaflet/')) return 'Leaflet';
  if (spec === '@turf' || spec.startsWith('@turf/') || spec === 'turf' || spec.startsWith('turf/')) {
    return 'turf';
  }
  if (spec === 'firebase/firestore' || spec.startsWith('firebase/firestore/')) return 'Firestore';
  return null;
}

function auditSocGreps() {
  console.log('\n== SoC greps ==');
  let failed = 0;

  const libFiles = walk(join(ROOT, 'src', 'lib'));
  for (const abs of libFiles) {
    const rel = relative(ROOT, abs).replace(/\\/g, '/');
    const specs = importSpecifiers(readFileSync(abs, 'utf8'));
    for (const spec of specs) {
      if (importsSrcComponents(spec)) {
        fail(`${rel} imports ${spec} — src/lib must not import src/components`);
        failed += 1;
      }
    }
  }

  const pageFiles = walk(join(ROOT, 'src', 'pages'));
  for (const abs of pageFiles) {
    const rel = relative(ROOT, abs).replace(/\\/g, '/');
    const specs = importSpecifiers(readFileSync(abs, 'utf8'));
    for (const spec of specs) {
      const kind = isForbiddenPageImport(spec);
      if (kind) {
        fail(`${rel} imports ${spec} — page is compose only (no ${kind})`);
        failed += 1;
      }
    }
  }

  if (failed === 0) ok('src/lib ↛ src/components; pages ↛ Leaflet / turf / Firestore');
  return failed;
}

function auditLayering() {
  console.log('\n== Layering ==');
  let failed = 0;
  const farmModules = readFileSync(join(ROOT, 'shared/auth/farmModules.ts'), 'utf8');
  if (/from ['"][^'"]*cropPacks['"]/.test(farmModules)) {
    fail('shared/auth/farmModules.ts must never import cropPacks');
    failed += 1;
  }
  const auth = readFileSync(join(ROOT, 'src/contexts/AuthContext.tsx'), 'utf8');
  if (/from ['"][^'"]*\/hooks\//.test(auth)) {
    fail('AuthContext must never import pack hooks');
    failed += 1;
  }
  if (failed === 0) ok('farmModules ↛ cropPacks; AuthContext ↛ hooks');
  return failed;
}

function auditCycles() {
  console.log('\n== Import cycles ==');
  let madge;
  try {
    madge = require('madge');
  } catch {
    fail('madge is not installed (npm i -D madge)');
    return 1;
  }
  return madge([join(ROOT, 'src'), join(ROOT, 'shared'), join(ROOT, 'server'), join(ROOT, 'plugins')], {
    fileExtensions: ['ts', 'tsx'],
    tsConfig: join(ROOT, 'tsconfig.json'),
    detectiveOptions: { ts: { skipTypeImports: true }, tsx: { skipTypeImports: true } },
    excludeRegExp: [/\.test\.(ts|tsx)$/, /\/mist\//],
  })
    .then((res) => {
      const cycles = res.circular();
      if (cycles.length > 0) {
        for (const c of cycles) fail(`cycle: ${c.join(' → ')}`);
        return cycles.length;
      }
      ok('no circular imports in src/ + shared/ + server/ + plugins/');
      return 0;
    })
    .catch((err) => {
      fail(`madge failed: ${err instanceof Error ? err.message : err}`);
      return 1;
    });
}

async function main() {
  let failed = 0;
  failed += auditSizes();
  failed += auditHarvestDrying();
  failed += auditPackFolders();
  failed += auditLayering();
  failed += auditSocGreps();
  failed += await auditCycles();
  console.log('');
  if (failed > 0) {
    console.error(`audit:codebase failed (${failed} issue${failed === 1 ? '' : 's'}).`);
    process.exit(1);
  }
  console.log('audit:codebase passed.');
}

void main();
