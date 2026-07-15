/**
 * Deploy local firestore.rules to the AI Studio Firestore release.
 *
 * Usage (from repo root):
 *   node scripts/deployFirestoreRules.mjs
 *
 * Uses secrets/*-firebase-adminsdk-*.json for auth.
 * AI Studio apps publish under:
 *   releases/cloud.firestore/ai-studio-<appId>
 * not the default cloud.firestore release.
 */
import { readFileSync, readdirSync } from 'fs';
import { createRequire } from 'module';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let GoogleAuth;
try {
  ({ GoogleAuth } = require('google-auth-library'));
} catch {
  ({ GoogleAuth } = require(join(root, 'node_modules/firebase-tools/node_modules/google-auth-library')));
}

const PROJECT_ID = 'gen-lang-client-0444791425';
const AI_STUDIO_APP_ID = '143a17d7-b431-4490-8302-3a5ff176bb96';
const RELEASE_ID = `cloud.firestore/ai-studio-${AI_STUDIO_APP_ID}`;

function findKeyFile() {
  const secretsDir = join(root, 'secrets');
  const match = readdirSync(secretsDir).find((f) => f.includes('firebase-adminsdk') && f.endsWith('.json'));
  if (!match) throw new Error('No firebase-adminsdk JSON found in secrets/');
  return join(secretsDir, match);
}

async function main() {
  const keyFile = findKeyFile();
  const rules = readFileSync(join(root, 'firestore.rules'), 'utf8');
  const auth = new GoogleAuth({
    keyFile,
    scopes: [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/firebase',
    ],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('Failed to obtain access token');

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const fetchJson = async (url, init) => {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60000) });
    const text = await res.text();
    return { res, text };
  };

  console.log('Creating ruleset…');
  const { res: createRes, text: createText } = await fetchJson(
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/rulesets`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source: { files: [{ name: 'firestore.rules', content: rules }] },
      }),
    }
  );
  if (!createRes.ok) {
    console.error(createText);
    process.exit(1);
  }
  const { name: rulesetName } = JSON.parse(createText);
  console.log('Ruleset:', rulesetName);

  // AI Studio release IDs contain a slash; leave it unencoded so the path matches
  // projects/*/releases/** (same as firebase-tools).
  const releaseName = `projects/${PROJECT_ID}/releases/${RELEASE_ID}`;
  const patchUrl = `https://firebaserules.googleapis.com/v1/${releaseName}`;

  console.log('Updating release', RELEASE_ID, '…');
  const { res: patchRes, text: patchText } = await fetchJson(patchUrl, {
    method: 'PATCH',
    headers,
    // UpdateReleaseRequest shape used by firebase-tools
    body: JSON.stringify({
      release: {
        name: releaseName,
        rulesetName,
      },
    }),
  });
  if (!patchRes.ok) {
    console.error(patchText);
    console.error('\nIf this fails with permission errors, grant the service account');
    console.error('roles/firebaserules.admin, or publish rules from AI Studio / Firebase Console.');
    process.exit(1);
  }
  console.log('OK — Firestore rules deployed to', RELEASE_ID);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
