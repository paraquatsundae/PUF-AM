/**
 * Set Firebase custom claims `platformAdmin` + `admin` for a user UID.
 * Merges with existing farm claims so a rewrite does not drop farmId / role.
 *
 * Usage (requires Firebase service account / GOOGLE_APPLICATION_CREDENTIALS):
 *   npx tsx scripts/setAdminClaim.ts <uid>
 *   npx tsx scripts/setAdminClaim.ts --revoke <uid>
 */
import admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

dotenv.config();

function resolveProjectId(): string | undefined {
  const configPath = resolve(process.cwd(), 'firebase-applet-config.json');
  if (!existsSync(configPath)) return undefined;
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as { projectId?: string };
    return config.projectId;
  } catch {
    return undefined;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const revoke = args[0] === '--revoke';
  const uid = revoke ? args[1] : args[0];

  if (!uid) {
    console.error('Usage: npx tsx scripts/setAdminClaim.ts <uid>');
    console.error('       npx tsx scripts/setAdminClaim.ts --revoke <uid>');
    process.exit(1);
  }

  if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID || resolveProjectId();
    admin.initializeApp(projectId ? { projectId } : undefined);
  }

  const user = await admin.auth().getUser(uid);
  const existing = { ...(user.customClaims || {}) };
  if (revoke) {
    delete existing.admin;
    delete existing.platformAdmin;
    await admin.auth().setCustomUserClaims(uid, existing);
  } else {
    await admin.auth().setCustomUserClaims(uid, {
      ...existing,
      admin: true,
      platformAdmin: true,
    });
  }
  const updated = await admin.auth().getUser(uid);
  console.log(`Custom claims for ${updated.email || uid}:`, updated.customClaims);
  console.log(
    revoke
      ? 'Platform admin claim revoked. User must re-login to refresh token.'
      : 'Platform admin claim set. User must re-login to refresh token.'
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
