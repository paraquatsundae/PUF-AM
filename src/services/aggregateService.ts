import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface BlightAggregate {
  currentRiskScore: number;
  lastUpdated: string;
  startDate?: string;
  endDate?: string;
  stationCode?: string;
  resultsCount?: number;
}

export async function getBlightAggregate(farmId: string): Promise<BlightAggregate | null> {
  try {
    const snap = await getDoc(doc(db, `farms/${farmId}/aggregates/blight_daily`));
    return snap.exists() ? (snap.data() as BlightAggregate) : null;
  } catch (error) {
    console.error('[Aggregates] Failed to read blight aggregate:', error);
    return null;
  }
}

export function isAggregateFresh(lastUpdated: string, maxAgeHours = 26): boolean {
  const hours = (Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60);
  return hours < maxAgeHours;
}
