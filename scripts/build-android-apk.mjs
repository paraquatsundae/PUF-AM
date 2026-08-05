/**
 * Produce a debug APK for the workshop tablets, in one command, from either
 * Fedora or the Windows box.
 *
 * Three steps that were previously three places to get wrong: the Vite build
 * with the Capacitor + mist flags baked (`build-android-web.mjs`), `cap sync`
 * to copy `dist/` into the Android project, and Gradle's `assembleDebug`.
 * Skipping the first two and running Gradle alone is the usual way to ship a
 * tablet an APK full of last week's bundle.
 *
 * The APK is built **packaged** (`CAP_PACKAGED=1`): the WebView loads its own
 * copied assets rather than `http://10.0.2.2:3000`, which only resolves on an
 * emulator and leaves a physical tablet staring at a blank screen. Pass `--live`
 * for the workshop live-reload shape instead.
 *
 * Usage:
 *   node scripts/build-android-apk.mjs              mist chooser included
 *   node scripts/build-android-apk.mjs --no-mist    Firebase-only APK
 *   node scripts/build-android-apk.mjs --live       WebView loads CAP_SERVER_URL
 *   node scripts/build-android-apk.mjs --release    assembleRelease (unsigned)
 *
 * Needs a JDK and the Android SDK — `android/local.properties` must point at it.
 * Plan: `Plans/APK_FREENET_PLUGIN.md` §6.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const androidDir = join(repoRoot, 'android');
const windows = process.platform === 'win32';

const noMist = process.argv.includes('--no-mist');
const release = process.argv.includes('--release');
const live = process.argv.includes('--live');
const variant = release ? 'Release' : 'Debug';

function run(command, args, options = {}) {
  console.log(`\n[apk] ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: 'inherit',
    shell: windows,
    env: { ...process.env, ...options.env },
  });
  if (result.status !== 0) {
    console.error(`[apk] failed: ${command} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(join(androidDir, 'local.properties'))) {
  console.warn(
    '[apk] android/local.properties is missing — Gradle will need ANDROID_HOME or sdk.dir set.',
  );
}

/**
 * Gradle reports a too-new JDK as `Unsupported class file major version NN`,
 * several screens into a Kotlin stack trace, which reads like a broken build
 * rather than a wrong toolchain. Fedora ships JDK 25; AGP wants 17 or 21.
 */
function javaMajor() {
  const probe = spawnSync('java', ['-version'], { encoding: 'utf8', shell: windows });
  const match = /version "(\d+)/.exec(`${probe.stderr ?? ''}${probe.stdout ?? ''}`);
  return match ? Number(match[1]) : null;
}

const major = javaMajor();
if (major === null) {
  console.error('[apk] no `java` on PATH. Android Gradle needs a JDK 17 or 21.');
  process.exit(1);
}
if (major > 21) {
  console.error(
    `[apk] JDK ${major} is too new for the Android Gradle Plugin — it needs 17 or 21.\n` +
      '[apk] Point JAVA_HOME at one and re-run, e.g.\n' +
      '[apk]   JAVA_HOME=/path/to/jdk-21 npm run apk:debug',
  );
  process.exit(1);
}

run(process.execPath, ['scripts/build-android-web.mjs', ...(noMist ? ['--no-mist'] : [])]);
run(windows ? 'npx.cmd' : 'npx', ['cap', 'sync', 'android'], {
  env: live ? {} : { CAP_PACKAGED: '1' },
});

const gradlew = windows ? 'gradlew.bat' : './gradlew';
run(gradlew, [`assemble${variant}`], { cwd: androidDir });

const apk = join(
  androidDir,
  'app',
  'build',
  'outputs',
  'apk',
  release ? 'release' : 'debug',
  release ? 'app-release-unsigned.apk' : 'app-debug.apk',
);

console.log(`\n[apk] ${existsSync(apk) ? 'built' : 'expected'}: ${apk}`);
console.log(
  `[apk] mist storage chooser: ${noMist ? 'excluded (Firebase-only build)' : 'included'}`,
);
console.log(`[apk] WebView assets: ${live ? 'live reload from CAP_SERVER_URL' : 'packaged'}`);
console.log('[apk] install on a connected tablet: npm run apk:install');
