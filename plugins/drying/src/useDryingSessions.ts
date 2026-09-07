import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../../src/firebase';
import type { DryingSession } from './dryingModel';
import { getFarmAssets, type FarmDryer } from '../../../src/lib/farmAssets';

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
    // Names only — a failed read costs a label on a session row, so it falls
    // back to empty rather than blocking the list. The panel that *writes* the
    // dryer list treats the same failure as fatal.
    getFarmAssets(farmId)
      .then((assets) => {
        if (!cancelled) setDryers(assets.dryers);
      })
      .catch((error) => {
        // Cleared, not left alone: on a farm switch this state still holds the
        // previous farm's dryers, and keeping them would label these sessions
        // with another farm's bins.
        console.error('Error fetching dryer list:', error);
        if (!cancelled) setDryers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [farmId]);

  return { sessions, dryers, loading };
}
