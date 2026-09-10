import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Hosted PUF-AM lives on `pufworks-am` with a normal `(default)` Firestore.
 * The retired AI Studio project used a named database; do not point this file
 * at that id. Triggers must still pass `database: FIRESTORE_DATABASE_ID`.
 */
export const HOSTED_FUNCTIONS_REGION = "australia-southeast1";

export const FIRESTORE_DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID || "(default)";

export function getDb() {
  const app = admin.app();
  return FIRESTORE_DATABASE_ID && FIRESTORE_DATABASE_ID !== "(default)"
    ? getFirestore(app, FIRESTORE_DATABASE_ID)
    : getFirestore(app);
}
