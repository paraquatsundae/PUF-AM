import { db, auth } from "../firebase";
import { doc, increment, setDoc } from "firebase/firestore";
import { format } from "date-fns";

export type MetricType = 'weather' | 'read' | 'write';

export const COST_ESTIMATES = {
  weather: 0.0001, // $0.0001 per call
  read: 0.06 / 100000, // $0.06 per 100k reads
  write: 0.18 / 100000, // $0.18 per 100k writes
};

/**
 * Tracks a specific metric (weather call or Firestore operation).
 * Updates global, daily, and user-specific counters.
 */
export async function trackMetric(type: MetricType, count: number = 1) {
  const user = auth.currentUser;
  if (!user) return;

  const date = format(new Date(), 'yyyy-MM-dd');
  const fieldMap = {
    weather: 'totalWeatherCalls',
    read: 'totalFirestoreReads',
    write: 'totalFirestoreWrites'
  };

  const userFieldMap = {
    weather: `userBreakdown.${user.uid}.weatherCalls`,
    read: `userBreakdown.${user.uid}.firestoreReads`,
    write: `userBreakdown.${user.uid}.firestoreWrites`
  };

  const field = fieldMap[type];
  const userField = userFieldMap[type];

  const updates = [
    { ref: doc(db, 'metrics_global', 'all'), data: { [field]: increment(count) } },
    { ref: doc(db, 'metrics_daily', date), data: { [field]: increment(count), [userField]: increment(count) } },
    { ref: doc(db, 'metrics_users', user.uid), data: { [field]: increment(count) } }
  ];

  // Use setDoc with merge: true to handle non-existent documents
  await Promise.all(updates.map(update => 
    setDoc(update.ref, update.data, { merge: true }).catch(err => {
      console.warn(`Metric tracking failed for ${update.ref.path}:`, err);
    })
  ));
}

/**
 * The counters `trackMetric` maintains, as the admin usage tab reads them back.
 *
 * Optional throughout because a metrics doc only gains a field once something
 * has incremented it — a farm that has never called the weather proxy has no
 * `totalWeatherCalls` key at all.
 */
export type UsageMetrics = {
  totalWeatherCalls?: number;
  totalFirestoreReads?: number;
  totalFirestoreWrites?: number;
};

/**
 * Calculates the estimated cost based on usage metrics.
 */
export function calculateEstimatedCost(metrics: UsageMetrics) {
  const weatherCost = (metrics.totalWeatherCalls || 0) * COST_ESTIMATES.weather;
  const readCost = (metrics.totalFirestoreReads || 0) * COST_ESTIMATES.read;
  const writeCost = (metrics.totalFirestoreWrites || 0) * COST_ESTIMATES.write;

  return {
    weather: weatherCost,
    firestore: readCost + writeCost,
    total: weatherCost + readCost + writeCost
  };
}
