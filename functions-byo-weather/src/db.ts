import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

import type { WeatherDb } from './weatherDb';

if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * BYO wizard creates the Spark `(default)` database only. Do not read
 * `FIRESTORE_DATABASE_ID` from the environment — a workshop shell pointed at
 * the hosted named DB would silently write the wrong project.
 */
export function getDb() {
  return getFirestore(admin.app());
}

export function getWeatherDb(): WeatherDb {
  return getDb() as unknown as WeatherDb;
}

export function getAuth() {
  return admin.auth();
}
