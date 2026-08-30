import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import type { DryingSession } from '../lib/dryingModel';
import { getFarmAssets, type FarmDryer } from '../lib/farmAssets';

/** Firestore subscribe for drying sessions + dryer list (drying pack). */
export function useDryingSessions(farmId: string | undefined) {
  const [sessions, setSessions] = useState<DryingSession[]>([]);
  const [dryers, setDryers] = useState<FarmDryer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!farmId) return;
    const sessionQuery = query(
      collection(db, 'farms', farmId, 'drying_sessions'),
      orderBy('startTime', 'desc')
    );
    const unsubscribe = onSnapshot(
      sessionQuery,
      (snapshot) => {
        setSessions(
          snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as DryingSession[]
        );
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching drying sessions:', error);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [farmId]);

  useEffect(() => {
    if (!farmId) return;
    let cancelled = false;
    getFarmAssets(farmId).then((assets) => {
      if (!cancelled) setDryers(assets.dryers);
    });
    return () => {
      cancelled = true;
    };
  }, [farmId]);

  return { sessions, dryers, loading };
}
