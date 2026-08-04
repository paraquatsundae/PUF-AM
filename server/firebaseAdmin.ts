/**
 * Firebase Admin for local Express auth (invite PIN mint / redeem).
 * Uses secrets/* service account when GOOGLE_APPLICATION_CREDENTIALS is unset.
 *
 * The SDK is loaded on first use rather than imported, because the packaged
 * desktop build deliberately does not ship it — `/api/auth/*` and
 * `/api/weather/*` are cloud-only there (`Plans/DESKTOP_FREENET_PLUGIN.md` §6.2),
 * and a static import would make the Electron main process fail at boot instead.
 * Callers already treat `isAdminSdkReady() === false` as "route unavailable".
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type adminSdk from 'firebase-admin';

type AdminModules = {
  admin: typeof adminSdk;
  auth: typeof import('firebase-admin/auth');
  firestore: typeof import('firebase-admin/firestore');
};

const loadModule = createRequire(import.meta.url);

/** `null` once we know the SDK is absent; `undefined` before the first attempt. */
let modules: AdminModules | null | undefined;
let initAttempted = false;

function loadAdminModules(): AdminModules {
  if (modules === null) {
    throw new Error(
      'firebase-admin is not available in this build — /api/auth/* and /api/weather/* are cloud-only on desktop',
    );
  }
  if (modules) return modules;
  try {
    modules = {
      admin: loadModule('firebase-admin') as typeof adminSdk,
      auth: loadModule('firebase-admin/auth') as AdminModules['auth'],
      firestore: loadModule('firebase-admin/firestore') as AdminModules['firestore'],
    };
  } catch {
    modules = null;
    return loadAdminModules();
  }
  return modules;
}

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

export function getAdminApp(): adminSdk.app.App {
  const { admin } = loadAdminModules();
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
    const cred = JSON.parse(saJson) as adminSdk.ServiceAccount;
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
  return loadAdminModules().auth.getAuth();
}

export function getAdminDb() {
  const app = getAdminApp();
  const { getFirestore } = loadAdminModules().firestore;
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
