/**
 * Deploy firestore.rules + indexes to hosted `pufworks-am` `(default)`.
 *
 * Usage (from repo root):
 *   npm run deploy:rules
 *
 * The AI Studio named-database release path is gone. Standard firebase-tools
 * is enough now that production is `(default)`.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || 'pufworks-am';

// `npx` is `npx.cmd` on Windows, which Node cannot spawn without a shell. Same
// shape as `build-android-apk.mjs`; the arguments here carry no spaces or shell
// metacharacters (project ids are [a-z0-9-]), so no quoting is needed.
const windows = process.platform === 'win32';

const result = spawnSync(
  windows ? 'npx.cmd' : 'npx',
  ['firebase', 'deploy', '--only', 'firestore:rules,firestore:indexes', '--project', projectId],
  { cwd: root, stdio: 'inherit', env: process.env, shell: windows },
);

if (result.error) {
  console.error(`Could not run npx: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
