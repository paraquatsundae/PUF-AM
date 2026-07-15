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

const EMPTY: FarmAssets = { dryers: [] };

export async function getFarmAssets(farmId: string): Promise<FarmAssets> {
  try {
    const snap = await getDoc(doc(db, 'farms', farmId, 'settings', 'assets'));
    if (!snap.exists()) return { ...EMPTY, dryers: [] };
    const data = snap.data() as Partial<FarmAssets>;
    return {
      dryers: Array.isArray(data.dryers) ? data.dryers : [],
    };
  } catch {
    return { ...EMPTY, dryers: [] };
  }
}

export async function saveFarmAssets(farmId: string, assets: FarmAssets): Promise<void> {
  await setDoc(doc(db, 'farms', farmId, 'settings', 'assets'), {
    dryers: assets.dryers,
  });
}
