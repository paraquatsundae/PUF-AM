import { initializeApp } from 'firebase/app';
import { getAuth, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth';
import {
  initializeFirestore,
  doc,
  getDocFromServer,
  persistentLocalCache,
  persistentSingleTabManager,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { Capacitor } from '@capacitor/core';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

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
  firebaseConfig.firestoreDatabaseId
);

/** IndexedDB auth persistence is more reliable than defaults in Capacitor WebViews. */
function createAuth() {
  if (!isNative) return getAuth(app);
  try {
    return initializeAuth(app, { persistence: indexedDBLocalPersistence });
  } catch {
    // HMR / second init — reuse existing Auth instance
    return getAuth(app);
  }
}

export const auth = createAuth();

export const storage = getStorage(app);

/** Clear corrupted Firestore IndexedDB (call then hard-reload). */
export async function clearFirestoreIndexedDb(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const databases = await (indexedDB.databases?.() ?? Promise.resolve([]));
  const names = databases
    .map((d) => d.name)
    .filter((n): n is string => !!n && (n.includes('firestore') || n.includes('firebase')));
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
    console.log('Firestore connection successful.');
  } catch (error) {
    // Expected offline / missing doc / permission — never throw into the app shell
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('[Firebase] Client appears offline during connection probe.');
    }
  }
}

testConnection();
