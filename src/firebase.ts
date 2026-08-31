import { initializeApp } from 'firebase/app';
import {
  getAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  initializeAuth,
} from 'firebase/auth';
import {
  initializeFirestore,
  doc,
  getDocFromServer,
  persistentLocalCache,
  persistentSingleTabManager,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { Capacitor } from '@capacitor/core';
import { setApiIdTokenProvider } from './lib/apiBase';
import { debugLog } from './lib/debugLog';
import { resolveFirebaseWebConfig } from './lib/byoFirebaseConfig';

const { config: firebaseConfig, byo: usingByoFirebase } = resolveFirebaseWebConfig();

const app = initializeApp(firebaseConfig);

export { usingByoFirebase };

const isNative = Capacitor.isNativePlatform();

/**
 * Single-tab persistent cache avoids multi-tab Watch TargetState races that
 * surface as FIRESTORE INTERNAL ASSERTION FAILED (IDs ca9 / b815).
 * Force long-polling on Capacitor — WebChannel often fails in Android WebView.
 */
export const db = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({
      tabManager: persistentSingleTabManager({ forceOwnership: true }),
    }),
    ...(isNative ? { experimentalForceLongPolling: true } : {}),
  },
  usingByoFirebase ? undefined : firebaseConfig.firestoreDatabaseId
);

/**
 * Remember-device: IndexedDB auth persistence on web and native so reopen
 * skips invite PIN until explicit logout or app-data wipe.
 */
function createAuth() {
  try {
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    // HMR / second init — reuse existing Auth instance
    return getAuth(app);
  }
}

export const auth = createAuth();

/**
 * Hand `apiFetch` a way to mint the bearer for `/api/auth/*`, `/api/weather/*`
 * and `/api/admin/*` without `apiBase` importing this module. `getIdToken()`
 * serves a cached token until it is close to expiry, so this is not a network
 * call per request.
 */
setApiIdTokenProvider(async () => {
  const user = auth.currentUser;
  return user ? await user.getIdToken() : null;
});

export const storage = getStorage(app);

/**
 * Clear corrupted Firestore IndexedDB (call then hard-reload).
 * Do NOT delete Firebase Auth databases — that forces invite-PIN login again.
 */
export async function clearFirestoreIndexedDb(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const databases = await (indexedDB.databases?.() ?? Promise.resolve([]));
  const names = databases
    .map((d) => d.name)
    .filter((n): n is string => {
      if (!n) return false;
      const lower = n.toLowerCase();
      // Firestore persistent cache only — never Auth (firebaseLocalStorageDB, etc.).
      return lower.includes('firestore');
    });
  await Promise.all(
    names.map(
      (name) =>
        new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase(name);
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
          req.onblocked = () => resolve();
        })
    )
  );
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    debugLog('Firestore connection successful.');
  } catch (error) {
    // Expected offline / missing doc / permission — never throw into the app shell
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('[Firebase] Client appears offline during connection probe.');
    }
  }
}

testConnection();
