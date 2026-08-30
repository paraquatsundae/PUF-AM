import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

/**
 * Verify or unpack a PUF-AM plugin package zip / folder.
 *
 *   npm run plugins:verify                 # all first-party folders in plugins/
 *   npm run plugins:verify -- path/to/pack.zip
 *   npm run plugins:unpack -- path/to/pack.zip
 *   npm run plugins:pack -- plugins/walnut_blight
 *   npm run plugins:list
 *
 * @see shared/farm/pluginPackage.ts · Plans/CROP_PACK_PLUGIN.md § Packaging
 */

const require = createRequire(import.meta.url);
const fflate = require('fflate');

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const PLUGINS_DIR = join(REPO_ROOT, 'plugins');

async function loadShared() {
  return import('../shared/farm/pluginPackage.ts');
}

function usage() {
  console.log(`Usage:
  npm run plugins:verify                      # all first-party folders
  npm run plugins:verify -- <path-to.zip|path-to-folder>
  npm run plugins:unpack -- <path-to.zip> [--force]
  npm run plugins:pack -- <path-to-folder>   # → plugins/<id>.zip
  npm run plugins:list
`);
}

function unzipToMemory(buf) {
  const files = fflate.unzipSync(new Uint8Array(buf));
  const out = {};
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('/')) continue;
    out[name.replace(/\\/g, '/')] = data;
  }
  return out;
}

function locateManifestInZip(files) {
  const names = Object.keys(files);
  if (files['plugin.json']) return { path: 'plugin.json', prefix: '' };
  const manifests = names.filter((n) => n.endsWith('/plugin.json') || n === 'plugin.json');
  if (manifests.length === 1) {
    const path = manifests[0];
    const prefix = path.slice(0, -'plugin.json'.length);
    return { path, prefix };
  }
  if (manifests.length === 0) {
    throw new Error('Zip has no plugin.json (at root or in a single top-level folder)');
  }
  throw new Error(`Zip has multiple plugin.json files: ${manifests.join(', ')}`);
}

function decodeUtf8(data) {
  return new TextDecoder('utf-8').decode(data);
}

async function verifyPath(target, shared) {
  const abs = resolve(target);
  if (!existsSync(abs)) {
    throw new Error(`Not found: ${abs}`);
  }
  const st = statSync(abs);
  if (st.isDirectory()) {
    const manifestPath = join(abs, shared.PLUGIN_MANIFEST_FILENAME);
    if (!existsSync(manifestPath)) {
      throw new Error(`Missing ${shared.PLUGIN_MANIFEST_FILENAME} in ${abs}`);
    }
    const text = readFileSync(manifestPath, 'utf8');
    const result = shared.parsePluginPackageManifestJson(text);
    if (!result.ok) {
      const detail = result.issues.map((i) => `  - ${i.path || '(root)'}: ${i.message}`).join('\n');
      throw new Error(`Invalid manifest:\n${detail}`);
    }
    const folderName = basename(abs);
    if (folderName !== '_skeleton' && folderName !== result.manifest.id) {
      throw new Error(
        `Folder name "${folderName}" must equal manifest id "${result.manifest.id}" (or be _skeleton)`
      );
    }
    return { kind: 'dir', abs, manifest: result.manifest };
  }

  if (!abs.endsWith('.zip')) {
    throw new Error('Expected a .zip file or an unpacked plugin directory');
  }
  const buf = readFileSync(abs);
  const files = unzipToMemory(buf);
  const { path: manifestEntry } = locateManifestInZip(files);
  const text = decodeUtf8(files[manifestEntry]);
  const result = shared.parsePluginPackageManifestJson(text);
  if (!result.ok) {
    const detail = result.issues.map((i) => `  - ${i.path || '(root)'}: ${i.message}`).join('\n');
    throw new Error(`Invalid manifest:\n${detail}`);
  }
  const zipBase = basename(abs, '.zip');
  if (zipBase !== result.manifest.id) {
    console.warn(
      `[plugins] warning: zip basename "${zipBase}" ≠ manifest id "${result.manifest.id}" (prefer ${result.manifest.id}.zip)`
    );
  }
  return { kind: 'zip', abs, manifest: result.manifest, files };
}

async function unpackZip(target, force, shared) {
  const verified = await verifyPath(target, shared);
  if (verified.kind !== 'zip') {
    throw new Error('plugins:unpack expects a .zip file');
  }
  const dest = join(PLUGINS_DIR, verified.manifest.id);
  if (existsSync(dest)) {
    if (!force) {
      throw new Error(`Refusing to overwrite ${dest} (pass --force)`);
    }
    rmSync(dest, { recursive: true, force: true });
  }
  mkdirSync(dest, { recursive: true });

  const { prefix } = locateManifestInZip(verified.files);
  for (const [name, data] of Object.entries(verified.files)) {
    if (prefix && !name.startsWith(prefix)) continue;
    const rel = prefix ? name.slice(prefix.length) : name;
    if (!rel || rel.endsWith('/')) continue;
    const outPath = resolve(dest, rel);
    const destRoot = resolve(dest);
    if (outPath !== destRoot && !outPath.startsWith(destRoot + '/') && !outPath.startsWith(destRoot + '\\')) {
      throw new Error(`Refusing path outside package: ${rel}`);
    }
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, data);
  }
  console.log(`Unpacked → ${dest}`);
  return dest;
}

function collectDirFiles(root, prefix = '') {
  const out = {};
  for (const name of readdirSync(root)) {
    if (name.startsWith('.') || name.endsWith('.zip')) continue;
    const abs = join(root, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    const st = statSync(abs);
    if (st.isDirectory()) {
      Object.assign(out, collectDirFiles(abs, rel));
    } else {
      out[rel] = new Uint8Array(readFileSync(abs));
    }
  }
  return out;
}

async function packFolder(target, shared) {
  const verified = await verifyPath(target, shared);
  if (verified.kind !== 'dir') {
    throw new Error('plugins:pack expects an unpacked plugin directory');
  }
  mkdirSync(PLUGINS_DIR, { recursive: true });
  const dest = join(PLUGINS_DIR, `${verified.manifest.id}.zip`);
  const files = collectDirFiles(verified.abs);
  if (!files[shared.PLUGIN_MANIFEST_FILENAME] && !files['plugin.json']) {
    throw new Error('Folder has no plugin.json at the zip root');
  }
  const zipped = fflate.zipSync(files);
  writeFileSync(dest, zipped);
  console.log(`Packed → ${dest}  (${verified.manifest.id}@${verified.manifest.version})`);
  return dest;
}

function listPackages(shared) {
  if (!existsSync(PLUGINS_DIR)) {
    console.log('No plugins/ directory.');
    return [];
  }
  const entries = [];
  for (const name of readdirSync(PLUGINS_DIR)) {
    if (name.startsWith('.')) continue;
    const abs = join(PLUGINS_DIR, name);
    if (!statSync(abs).isDirectory()) continue;
    if (name === '_skeleton') continue;
    const manifestPath = join(abs, shared.PLUGIN_MANIFEST_FILENAME);
    if (!existsSync(manifestPath)) {
      console.warn(`[plugins] skip ${name}: no plugin.json`);
      continue;
    }
    const result = shared.parsePluginPackageManifestJson(readFileSync(manifestPath, 'utf8'));
    if (!result.ok) {
      console.warn(`[plugins] skip ${name}: invalid manifest`);
      continue;
    }
    entries.push({ dir: abs, manifest: result.manifest });
  }
  return entries;
}

async function main() {
  const shared = await loadShared();
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (!cmd || cmd === '-h' || cmd === '--help') {
    usage();
    process.exit(cmd ? 0 : 1);
  }

  if (cmd === 'list' || cmd === '--list') {
    const found = listPackages(shared);
    if (!found.length) {
      console.log('No unpacked packages in plugins/ (drop a zip and run plugins:unpack).');
      return;
    }
    for (const { manifest, dir } of found) {
      console.log(
        `${manifest.id}@${manifest.version}  [${manifest.category}/${manifest.kind}]  ${manifest.label}\n  ${dir}`
      );
    }
    return;
  }

  if (cmd === 'verify' || cmd === '--verify') {
    const target = argv[1];
    if (!target) {
      const names = existsSync(PLUGINS_DIR) ? readdirSync(PLUGINS_DIR) : [];
      const dirs = names
        .filter((name) => !name.startsWith('.') && name !== '_skeleton')
        .map((name) => join(PLUGINS_DIR, name))
        .filter((abs) => statSync(abs).isDirectory() && existsSync(join(abs, shared.PLUGIN_MANIFEST_FILENAME)));
      if (!dirs.length) {
        throw new Error('No plugin folders with plugin.json under plugins/');
      }
      let failed = 0;
      for (const dir of dirs) {
        try {
          const v = await verifyPath(dir, shared);
          console.log(`OK  ${v.manifest.id}@${v.manifest.version}  (${v.manifest.category}, ${v.manifest.kind})`);
        } catch (err) {
          failed += 1;
          console.error(`FAIL  ${dir}: ${err instanceof Error ? err.message : err}`);
        }
      }
      if (failed > 0) process.exit(1);
      return;
    }
    const v = await verifyPath(target, shared);
    console.log(`OK  ${v.manifest.id}@${v.manifest.version}  (${v.manifest.category}, ${v.manifest.kind})`);
    console.log(`    ${v.manifest.label}`);
    return;
  }

  if (cmd === 'unpack' || cmd === '--unpack') {
    const target = argv[1];
    const force = argv.includes('--force');
    if (!target) {
      usage();
      process.exit(1);
    }
    await unpackZip(target, force, shared);
    return;
  }

  if (cmd === 'pack' || cmd === '--pack') {
    const target = argv[1];
    if (!target) {
      usage();
      process.exit(1);
    }
    await packFolder(target, shared);
    return;
  }

  usage();
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
