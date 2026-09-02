/**
 * Deploy PUFOM (Express + Vite) to Cloud Run — public HTTPS, no localhost.
 *
 * Cross-platform replacement for `deploy-cloudrun.ps1`, so `npm run
 * deploy:cloudrun` means the same thing on Fedora and Windows. The container
 * is built by Cloud Build from `--source .`, so no local Docker is needed.
 * Plan: `Plans/DEPLOY_CLOUD_RUN.md`.
 *
 * Prerequisites: gcloud CLI, logged in, billing enabled on the project.
 *
 * `--dry-run` resolves gcloud, reads the config, and prints the deploy command
 * without running anything that writes.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const isWindows = process.platform === 'win32';
const dryRun = process.argv.includes('--dry-run');

const projectId = process.env.GCLOUD_PROJECT || 'gen-lang-client-0444791425';
const region = process.env.CLOUD_RUN_REGION || 'australia-southeast1';
const service = process.env.CLOUD_RUN_SERVICE || 'pufom';

const DPIRD_SECRET = 'DPIRD_API_KEY';
const ENROLL_SECRET = 'PUF_ENROLLMENT_CODES';

function die(message) {
  console.error(message);
  process.exit(1);
}

/**
 * gcloud ships as `gcloud.cmd` on Windows, which Node refuses to spawn without
 * a shell; and the installer's default path has a space in it. So under a
 * shell, every argument gets quoted by hand.
 */
function winQuote(arg) {
  return /[\s()&^|<>"]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}

function findGcloud() {
  const probe = spawnSync(isWindows ? 'where' : 'which', ['gcloud'], {
    encoding: 'utf8',
    shell: isWindows,
  });
  if (probe.status === 0) {
    const first = probe.stdout.split('\n')[0].trim();
    if (first) return first;
  }

  const candidates = isWindows
    ? [join(process.env.LOCALAPPDATA ?? '', 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd')]
    : [
        join(process.env.HOME ?? '', 'google-cloud-sdk', 'bin', 'gcloud'),
        '/usr/lib/google-cloud-sdk/bin/gcloud',
        '/snap/bin/gcloud',
      ];

  const found = candidates.find((c) => c && existsSync(c));
  if (found) return found;

  die(
    isWindows
      ? 'gcloud not found. Install Google Cloud SDK (winget install Google.CloudSDK), open a new terminal, then retry.'
      : 'gcloud not found. Install Google Cloud SDK (https://cloud.google.com/sdk/docs/install), then retry.',
  );
}

const gcloud = findGcloud();

function runGcloud(args, { capture = false, input, allowFailure = false, mutates = false } = {}) {
  if (dryRun && mutates) {
    console.log(`  [dry-run] skipped: gcloud ${args.join(' ')}`);
    return { status: 0, stdout: '', stderr: '' };
  }
  const command = isWindows ? winQuote(gcloud) : gcloud;
  const argv = isWindows ? args.map(winQuote) : args;
  const result = spawnSync(command, argv, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: isWindows,
    input,
    stdio: capture || input !== undefined ? 'pipe' : 'inherit',
  });
  if (result.error) die(`Could not run gcloud: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) {
    if (capture && result.stderr) console.error(result.stderr);
    die(`gcloud ${args[0]} ${args[1] ?? ''} failed (exit ${result.status}).`);
  }
  return result;
}

/** Minimal `.env` reader: the deploy needs three keys, not a process-wide load. */
function readEnvValue(key) {
  const envFile = join(repoRoot, '.env');
  if (!existsSync(envFile)) return null;
  const line = readFileSync(envFile, 'utf8')
    .split('\n')
    .find((l) => new RegExp(`^\\s*${key}\\s*=`).test(l));
  if (!line) return null;
  const value = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
  return value || null;
}

function secretExists(name) {
  return runGcloud(['secrets', 'describe', name], { capture: true, allowFailure: true }).status === 0;
}

if (!existsSync(join(repoRoot, 'firebase-applet-config.json'))) {
  die('firebase-applet-config.json missing - copy from firebase-applet-config.example.json and fill values.');
}

console.log(`Project:  ${projectId}`);
console.log(`Region:   ${region}`);
console.log(`Service:  ${service}`);
console.log(`gcloud:   ${gcloud}`);

runGcloud(['config', 'set', 'project', projectId], { mutates: true });

// Idempotent.
runGcloud(
  [
    'services',
    'enable',
    'run.googleapis.com',
    'cloudbuild.googleapis.com',
    'secretmanager.googleapis.com',
    'artifactregistry.googleapis.com',
    '--quiet',
  ],
  { mutates: true },
);

if (!secretExists(DPIRD_SECRET)) {
  const value = readEnvValue('DPIRD_API_KEY');
  if (!value) {
    die(`No Secret Manager secret '${DPIRD_SECRET}' and no local .env DPIRD_API_KEY to bootstrap from.`);
  }
  if (value === 'YOUR_DPIRD_API_KEY') die('DPIRD_API_KEY in .env is empty/placeholder.');
  runGcloud(['secrets', 'create', DPIRD_SECRET, '--data-file=-'], { input: value, mutates: true });
  console.log(`Created Secret Manager secret ${DPIRD_SECRET}`);
}

// This is the gate on POST /api/auth/create-farm (Plans/FIREBASE_BILLING.md §5.1) — the
// server fails closed without it, so a deploy that forgets this turns farm creation off,
// which is the safe direction but worth knowing.
if (!secretExists(ENROLL_SECRET)) {
  const enrollFile = join(repoRoot, 'secrets', 'enrollment-codes.json');
  if (!existsSync(enrollFile)) {
    die(`No Secret Manager secret '${ENROLL_SECRET}' and no secrets/enrollment-codes.json to bootstrap from.`);
  }
  const codes = (JSON.parse(readFileSync(enrollFile, 'utf8')).codes ?? []).join(',');
  if (!codes) die('secrets/enrollment-codes.json has no codes.');
  runGcloud(['secrets', 'create', ENROLL_SECRET, '--data-file=-'], { input: codes, mutates: true });
  console.log(`Created Secret Manager secret ${ENROLL_SECRET}`);
}

const projectNumber = runGcloud(['projects', 'describe', projectId, '--format=value(projectNumber)'], {
  capture: true,
}).stdout.trim();
const runtimeSa = `${projectNumber}-compute@developer.gserviceaccount.com`;

for (const secret of [DPIRD_SECRET, ENROLL_SECRET]) {
  runGcloud(
    [
      'secrets',
      'add-iam-policy-binding',
      secret,
      `--member=serviceAccount:${runtimeSa}`,
      '--role=roles/secretmanager.secretAccessor',
      '--quiet',
    ],
    { capture: true, mutates: true },
  );
}

let firestoreDb = 'ai-studio-143a17d7-b431-4490-8302-3a5ff176bb96';
try {
  const cfg = JSON.parse(readFileSync(join(repoRoot, 'firebase-applet-config.json'), 'utf8'));
  if (cfg.firestoreDatabaseId) firestoreDb = String(cfg.firestoreDatabaseId);
} catch {
  console.warn('Warning: could not parse firebase-applet-config.json for firestoreDatabaseId');
}

// Canonical production hostname (custom domain). Fallback run.app still works.
const envAppUrl = process.env.APP_URL?.trim().replace(/^["']|["']$/g, '');
let appUrl = envAppUrl || 'https://am.pufworks.farm';
const fromEnvFile = readEnvValue('APP_URL');
if (fromEnvFile && !fromEnvFile.includes('localhost')) appUrl = fromEnvFile;

// Vite bakes VITE_* at image build time; .env is in .gcloudignore so pass build env explicitly.
// No map key here any more: satellite imagery goes through /api/tiles on the
// server, so nothing map-related needs to reach the browser. See
// Plans/API_KEY_SECURITY.md.
let viteAppUrl = appUrl;
const viteFromEnvFile = readEnvValue('VITE_APP_URL');
if (viteFromEnvFile && !viteFromEnvFile.includes('localhost')) viteAppUrl = viteFromEnvFile;

console.log(`APP_URL:  ${appUrl}`);
console.log(`Firestore: ${firestoreDb}`);
console.log('Building and deploying (Cloud Build + Cloud Run)...');

const deployArgs = [
  'run',
  'deploy',
  service,
  '--source',
  '.',
  '--region',
  region,
  '--platform',
  'managed',
  '--allow-unauthenticated',
  '--port',
  '8080',
  '--memory',
  '1Gi',
  '--cpu',
  '1',
  '--min-instances',
  '0',
  '--max-instances',
  '3',
  `--set-build-env-vars=VITE_APP_URL=${viteAppUrl},VITE_MIST_EXPERIMENTAL=true`,
  `--set-env-vars=NODE_ENV=production,FIREBASE_PROJECT_ID=${projectId},FIRESTORE_DATABASE_ID=${firestoreDb},APP_URL=${appUrl},MIST_FREENET_DISABLED=1`,
  `--set-secrets=${DPIRD_SECRET}=${DPIRD_SECRET}:latest,${ENROLL_SECRET}=${ENROLL_SECRET}:latest`,
];

if (dryRun) {
  console.log(`  [dry-run] would run: gcloud ${deployArgs.join(' ')}`);
  console.log('\nDry run complete — nothing was deployed.');
  process.exit(0);
}

runGcloud(deployArgs, { mutates: true });

const url = runGcloud(
  ['run', 'services', 'describe', service, '--region', region, '--format=value(status.url)'],
  { capture: true },
).stdout.trim();

console.log('');
console.log(`Deployed: ${url}`);
console.log(`Canonical: ${appUrl}`);
console.log(`Health:   ${appUrl}/api/health (or ${url}/api/health)`);
console.log('');
console.log('Next:');
console.log('  1. Domain map + DNS: see Plans/DEPLOY_CLOUD_RUN.md (am.pufworks.farm)');
console.log('  2. Firebase Auth authorized domain: am.pufworks.farm');
console.log(`  3. Maps HTTP referrer: https://am.pufworks.farm/* (keep ${url}/* as fallback)`);
console.log('  4. Grant the Cloud Run SA Firebase Admin if invite PIN fails');
console.log(`  5. Capacitor: CAP_PACKAGED=1 with VITE_API_BASE_URL=${appUrl}`);
