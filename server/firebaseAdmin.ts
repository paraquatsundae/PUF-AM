/**
 * Firebase Admin for local Express auth (invite PIN mint / redeem).
 * Uses secrets/* service account when GOOGLE_APPLICATION_CREDENTIALS is unset.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

let initAttempted = false;

function resolveProjectConfig(): { projectId: string; firestoreDatabaseId?: string } | null {
  const configPath = resolve(process.cwd(), 'firebase-applet-config.json');
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, 'utf8')) as {
      projectId: string;
      firestoreDatabaseId?: string;
    };
  } catch {
    return null;
  }
}

function resolveServiceAccountPath(): string | undefined {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  const secretsDir = resolve(process.cwd(), 'secrets');
  if (!existsSync(secretsDir)) return undefined;
  const match = readdirSync(secretsDir).find((f) => f.endsWith('.json') && f.includes('firebase-adminsdk'));
  return match ? resolve(secretsDir, match) : undefined;
}

export function getAdminApp(): admin.app.App {
  if (admin.apps.length) return admin.app();
  if (initAttempted && !admin.apps.length) {
    throw new Error('Firebase Admin failed to initialize earlier');
  }
  initAttempted = true;

  const config = resolveProjectConfig();
  const projectId = process.env.FIREBASE_PROJECT_ID || config?.projectId;
  const saPath = resolveServiceAccountPath();

  // Optional: full service-account JSON in env (Cloud Run secret) — never commit.
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (saJson) {
    const cred = JSON.parse(saJson) as admin.ServiceAccount;
    return admin.initializeApp({
      credential: admin.credential.cert(cred),
      projectId: projectId || (cred as { projectId?: string }).projectId,
    });
  }

  if (saPath && existsSync(saPath)) {
    const cred = JSON.parse(readFileSync(saPath, 'utf8'));
    return admin.initializeApp({
      credential: admin.credential.cert(cred),
      projectId: projectId || cred.project_id,
    });
  }

  // Cloud Run / GCP: Application Default Credentials (no secrets/ file needed).
  return admin.initializeApp(projectId ? { projectId } : undefined);
}

export function getAdminAuth() {
  getAdminApp();
  return getAuth();
}

export function getAdminDb() {
  const app = getAdminApp();
  const config = resolveProjectConfig();
  const databaseId =
    process.env.FIRESTORE_DATABASE_ID || config?.firestoreDatabaseId || '(default)';
  if (databaseId && databaseId !== '(default)') {
    return getFirestore(app, databaseId);
  }
  return getFirestore(app);
}

export function isAdminSdkReady(): boolean {
  try {
    getAdminApp();
    return true;
  } catch {
    return false;
  }
}
