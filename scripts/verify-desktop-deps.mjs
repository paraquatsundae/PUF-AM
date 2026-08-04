/**
 * Keep `electron-builder.yml`'s node_modules allowlist in step with the bundle.
 *
 * `scripts/build-desktop.mjs` leaves npm packages external, so the packaged asar
 * has to carry the main process's runtime closure. electron-builder would
 * otherwise ship *every* production dependency — ~400 MB of React, icon sets, and
 * PDF libraries that Vite already inlined into `dist/`. Hence the allowlist, and
 * hence this check: the failure mode of a stale allowlist is `MODULE_NOT_FOUND`
 * on an operator's machine, which is exactly the kind of thing that should break
 * the build instead.
 *
 * Usage:
 *   node scripts/verify-desktop-deps.mjs           # verify (packaging gate)
 *   node scripts/verify-desktop-deps.mjs --print   # emit the YAML block to paste
 *
 * Plan: `Plans/DESKTOP_FREENET_PLUGIN.md` §8.2, §8.3, Phase 3.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = path.join(REPO_ROOT, 'electron-builder.yml');
const BUNDLES = ['desktop/build/main.cjs', 'desktop/build/preload.cjs'];

/** Electron is the runtime, not a packaged dependency. */
const NOT_PACKAGED = new Set(['electron']);

const printOnly = process.argv.slice(2).includes('--print');

function fail(message) {
  console.error(`\nverify-desktop-deps: ${message}`);
  process.exit(1);
}

function packageNameOf(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** Bare specifiers the bundle resolves at runtime, static and dynamic alike. */
function bundleSpecifiers() {
  const names = new Set();
  for (const relative of BUNDLES) {
    const file = path.join(REPO_ROOT, relative);
    if (!existsSync(file)) {
      fail(`${relative} is missing — run \`npm run desktop:build\` first.`);
    }
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:require|import)\(\s*["']([^"']+)["']/g)) {
      const specifier = match[1];
      if (specifier.startsWith('node:') || specifier.startsWith('.') || specifier.startsWith('/')) {
        continue;
      }
      const name = packageNameOf(specifier);
      if (!NOT_PACKAGED.has(name)) names.add(name);
    }
  }
  return names;
}

function readManifest(name) {
  const file = path.join(REPO_ROOT, 'node_modules', name, 'package.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

/** Transitive `dependencies` closure — what Node will actually reach for. */
function closureOf(roots) {
  const seen = new Set();
  const missing = [];
  const walk = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    const manifest = readManifest(name);
    if (!manifest) {
      missing.push(name);
      return;
    }
    for (const dependency of Object.keys(manifest.dependencies ?? {})) walk(dependency);
    // Optional deps only matter when they were actually installed.
    for (const dependency of Object.keys(manifest.optionalDependencies ?? {})) {
      if (readManifest(dependency)) walk(dependency);
    }
  };
  for (const root of roots) walk(root);
  if (missing.length) {
    fail(`not installed: ${missing.join(', ')}. Run \`npm install\`.`);
  }
  return [...seen].sort();
}

/**
 * Names the config lets through. Only the shape this repo writes is understood —
 * `- node_modules/name/**` and `- node_modules/{a,b,@scope/c}/**` — because a real
 * YAML parser is a dependency this script does not need.
 */
function allowlistFromConfig() {
  if (!existsSync(CONFIG_PATH)) fail('electron-builder.yml is missing.');
  const allowed = new Set();
  for (const line of readFileSync(CONFIG_PATH, 'utf8').split('\n')) {
    const match = /^\s*-\s*'?node_modules\/(.+?)\/\*\*'?\s*$/.exec(line);
    if (!match) continue;
    const body = match[1];
    const braced = /^\{(.+)\}$/.exec(body);
    for (const name of braced ? braced[1].split(',') : [body]) {
      const trimmed = name.trim();
      if (trimmed) allowed.add(trimmed);
    }
  }
  return allowed;
}

/** Group into readable brace lines so the config stays reviewable. */
function yamlBlock(names, width = 96) {
  const lines = [];
  let current = [];
  const render = (group) => `  - node_modules/{${group.join(',')}}/**`;
  for (const name of names) {
    if (current.length && render([...current, name]).length > width) {
      lines.push(render(current));
      current = [];
    }
    current.push(name);
  }
  if (current.length) lines.push(render(current));
  return lines.join('\n');
}

const roots = [...bundleSpecifiers()].sort();
const packageJson = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
const devOnly = roots.filter(
  (name) => !packageJson.dependencies?.[name] && packageJson.devDependencies?.[name],
);
if (devOnly.length) {
  fail(
    `the bundle requires ${devOnly.join(', ')}, which is a devDependency — electron-builder ships\n` +
      'production dependencies only, so the packaged app would fail at boot. Either promote it to\n' +
      '"dependencies", or load it lazily and tolerate its absence (see server/firebaseAdmin.ts).',
  );
}

const closure = closureOf(roots);

if (printOnly) {
  console.log(yamlBlock(closure));
  process.exit(0);
}

const allowed = allowlistFromConfig();
const missing = closure.filter((name) => !allowed.has(name));
const stale = [...allowed].filter((name) => !closure.includes(name)).sort();

console.log(`desktop runtime closure: ${closure.length} packages from ${roots.join(', ')}`);

if (missing.length || stale.length) {
  if (missing.length) console.error(`\n  would be missing from the asar: ${missing.join(', ')}`);
  if (stale.length) console.error(`\n  allowlisted but unreachable: ${stale.join(', ')}`);
  console.error(
    '\nReplace the node_modules block in electron-builder.yml with:\n\n' +
      `${yamlBlock(closure)}\n\n` +
      '(`node scripts/verify-desktop-deps.mjs --print` prints just that block.)',
  );
  process.exit(1);
}

console.log('  electron-builder.yml allowlist matches.');
