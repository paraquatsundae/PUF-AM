#!/usr/bin/env node
/**
 * What is actually in the shipped bundle — run after `npm run build`.
 *
 * A soft pen test of `am.pufworks.farm` raised two things that only a built
 * artefact can answer:
 *
 * 1. **Workshop mode.** `isWorkshopMode()` gates a `ProtectedRoute` bypass that
 *    hands out a fake signed-in admin. It reads `import.meta.env`, so Vite folds
 *    it to `return !1` in a normal production build — but a stray
 *    `VITE_WORKSHOP_MODE=true` in a build environment would fold it the other
 *    way, and the result looks like an ordinary deploy from the outside. Reading
 *    the source tells you nothing here; only the bundle does.
 * 2. **Keys.** The only credential that belongs in a browser bundle is the
 *    Firebase web API key. Since imagery moved behind `/api/tiles`, a second
 *    `AIza…`, a Mapbox `pk.ey…` or a MapTiler key appearing means a client key
 *    crept back in.
 *
 * Exit code 1 on a finding, so CI can gate on it:
 *
 *   npm run build && npm run audit:bundle
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = join(process.cwd(), 'dist');

/** Every emitted JS file, whatever the chunk layout happens to be. */
function jsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...jsFiles(path));
    else if (entry.endsWith('.js')) out.push(path);
  }
  return out;
}

const findings = [];
const notes = [];

let files;
try {
  files = jsFiles(DIST);
} catch {
  console.error('No dist/ to audit. Run `npm run build` first.');
  process.exit(1);
}
if (files.length === 0) {
  console.error('dist/ has no JavaScript in it. Did the build succeed?');
  process.exit(1);
}

const sources = files.map((path) => ({ path, code: readFileSync(path, 'utf8') }));

// ---------------------------------------------------------------------------
// 1. Workshop mode must have folded to false.
// ---------------------------------------------------------------------------
//
// Grepping for `VITE_WORKSHOP_MODE` does not work: the banner's own copy names
// the variable so the operator knows what to remove, so the string is in every
// build. Neither does grepping for "Workshop mode" — the banner survives
// tree-shaking either way, which is exactly why it turned up in a pen test of
// production and meant nothing.
//
// What does differ is what the gate folds to. `isWorkshopMode()` reads only
// `import.meta.env`, so Vite resolves it to a constant and terser reduces the
// whole function to `return!1` or `return!0`. Finding it by mangled name would
// be hopeless, so it is found structurally: the banner is the one component
// whose body is `return <gate>() ? <banner JSX> : null`, so locate the banner by
// its copy, read the name of the function it calls, and check that function's
// body. Verified against a `VITE_WORKSHOP_MODE=true` build, which yields `!0`.
const BANNER_COPY = 'Workshop mode — local UI only';
const GATED_BANNER = /^function \w+\(\)\{return (\w+)\(\)\?/;

let gateChecked = false;
for (const { code } of sources) {
  const bannerAt = code.indexOf(BANNER_COPY);
  if (bannerAt < 0) continue;

  const fnAt = code.lastIndexOf('function ', bannerAt);
  const gateName = code.slice(fnAt).match(GATED_BANNER)?.[1];
  if (!gateName) {
    findings.push(
      'Found the workshop banner but not the conditional that gates it. Either ' +
        'the banner now renders unconditionally — which is what a folded-true ' +
        'workshop flag looks like — or WorkshopModeBanner was refactored and this ' +
        'check needs rewriting against the new shape.'
    );
    gateChecked = true;
    break;
  }

  const gateBody = code.match(new RegExp(`function ${gateName}\\(\\)\\{return([^}]*)\\}`))?.[1];
  gateChecked = true;
  if (gateBody === '!1') {
    notes.push(`workshop mode folded to false (${gateName}() → return!1)`);
  } else {
    findings.push(
      `The workshop gate folded to \`return${gateBody}\`, not \`return!1\`. ` +
        'isWorkshopMode() is true in this bundle, so the ProtectedRoute bypass ' +
        'hands out a fake signed-in admin. Rebuild without VITE_WORKSHOP_MODE set.'
    );
  }
  break;
}
if (!gateChecked) {
  findings.push(
    `Could not find the workshop banner copy (${BANNER_COPY}) in the bundle, so ` +
      'the workshop flag could not be checked. If the banner was intentionally ' +
      'removed, delete this check rather than leaving it passing vacuously.'
  );
}

// ---------------------------------------------------------------------------
// 2. No client credential beyond the single Firebase web key.
// ---------------------------------------------------------------------------
const KEY_PATTERNS = [
  { label: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/g },
  { label: 'Mapbox token', re: /pk\.ey[0-9A-Za-z_.-]{20,}/g },
  { label: 'MapTiler key', re: /maptiler\.com\/[^"']*key=[0-9A-Za-z]{16,}/g },
];

for (const { label, re } of KEY_PATTERNS) {
  const found = new Set();
  for (const { code } of sources) for (const m of code.match(re) ?? []) found.add(m);
  if (found.size === 0) continue;

  if (label === 'Google API key' && found.size === 1) {
    // The Firebase web key is public by design — it identifies the project and
    // authorises nothing. See Plans/API_KEY_SECURITY.md.
    notes.push('exactly one Google API key present, as expected (Firebase web key)');
    continue;
  }
  findings.push(
    `${found.size} ${label}(s) in the bundle. Only the Firebase web key belongs ` +
      'in a browser; map imagery goes through /api/tiles and needs no client key.'
  );
}

// ---------------------------------------------------------------------------
// 3. No imagery provider called directly.
// ---------------------------------------------------------------------------
const DIRECT_PROVIDERS = ['server.arcgisonline.com', 'maps.googleapis.com'];
for (const host of DIRECT_PROVIDERS) {
  if (sources.some((s) => s.code.includes(host))) {
    findings.push(
      `${host} is referenced directly. Imagery must go through /api/tiles so the ` +
        "provider's terms and any key stay on the server."
    );
  }
}
if (findings.every((f) => !DIRECT_PROVIDERS.some((h) => f.includes(h)))) {
  notes.push('no imagery provider called directly');
}

// ---------------------------------------------------------------------------

console.log(`Audited ${files.length} JavaScript file(s) in dist/\n`);
for (const note of notes) console.log(`  ok  ${note}`);

if (findings.length === 0) {
  console.log('\nBundle audit passed.');
  process.exit(0);
}

console.error('\nBundle audit failed:\n');
for (const finding of findings) console.error(`  ✗ ${finding}\n`);
process.exit(1);
