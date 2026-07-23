import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * This AI Studio project has no `(default)` Firestore database — it uses a named
 * database (mirrors the Cloud Run server's FIRESTORE_DATABASE_ID). Every function
 * must target it explicitly, both at runtime (getDb) and for Firestore triggers
 * (the `database` option), or reads/writes and deploys hit a nonexistent DB.
 */
export const FIRESTORE_DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID || "ai-studio-143a17d7-b431-4490-8302-3a5ff176bb96";

export function getDb() {
  const app = admin.app();
  return FIRESTORE_DATABASE_ID && FIRESTORE_DATABASE_ID !== "(default)"
    ? getFirestore(app, FIRESTORE_DATABASE_ID)
    : getFirestore(app);
}
