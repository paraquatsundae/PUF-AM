import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface FarmDryer {
  id: string;
  name: string;
  capacityKg?: number;
  notes?: string;
}

export interface FarmAssets {
  dryers: FarmDryer[];
}

/**
 * Read the farm's asset doc. **Rejects** if the read fails.
 *
 * A farm with no asset doc yet is not a failure — that returns an empty list.
 * A failed read is different and must not be flattened into the same value:
 * `saveFarmAssets` writes the whole `dryers` array, so a caller that treats
 * "could not read" as "no dryers" and then saves erases the farm's real list.
 * Callers decide their own policy — `FarmDryersPanel` blocks saving until a
 * read succeeds, while `useDryingSessions` falls back to empty because a
 * missing dryer name there only costs a label.
 */
export async function getFarmAssets(farmId: string): Promise<FarmAssets> {
  const snap = await getDoc(doc(db, 'farms', farmId, 'settings', 'assets'));
  if (!snap.exists()) return { dryers: [] };
  const data = snap.data() as Partial<FarmAssets>;
  return {
    dryers: Array.isArray(data.dryers) ? data.dryers : [],
  };
}

export async function saveFarmAssets(farmId: string, assets: FarmAssets): Promise<void> {
  await setDoc(doc(db, 'farms', farmId, 'settings', 'assets'), {
    dryers: assets.dryers,
  });
}
