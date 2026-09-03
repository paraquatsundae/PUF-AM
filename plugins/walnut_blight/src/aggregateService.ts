import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../src/firebase';

export type BlightRiskBand = 'quiet' | 'watch' | 'action';

export interface BlightAggregate {
  /** Today's Ji et al. 2025 daily infection risk (unitless, typically << 0.1). */
  currentRiskScore: number;
  /** Grower band for currentRiskScore (matches BlightRisk page). */
  currentBand?: BlightRiskBand;
  /** Which model produced the score (e.g. 'ji-2025'). */
  model?: string;
  doseMode?: string;
  /** Date the currentRiskScore applies to (YYYY-MM-DD). */
  riskDate?: string;
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
