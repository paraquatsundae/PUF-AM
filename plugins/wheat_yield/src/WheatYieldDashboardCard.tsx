/**
 * Home card for the wheat yield scout. Hidden until the pack is installed.
 */
import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { Wheat } from 'lucide-react';
import { db } from '../../../src/firebase';
import { useAuth } from '../../../src/contexts/AuthContext';
import { DashboardCard } from '../../../src/components/ui/DashboardCard';
import { WHEAT_YIELD_PRIMARY_PATH } from '../../../shared/farm/wheatYieldPackage';
import { useWheatPack } from './useWheatPack';
import { WHEAT_YIELD_COLLECTION } from './useWheatScout';

export function WheatYieldDashboardCard() {
  const show = useWheatPack();
  const { userData } = useAuth();
  const farmId = show ? userData?.farmId : undefined;
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!farmId) {
      setCount(null);
      return;
    }
    const unsub = onSnapshot(
      collection(db, 'farms', farmId, WHEAT_YIELD_COLLECTION),
      (snap) => {
        const scouted = snap.docs.filter((row) => {
          const counts = row.data().counts;
          return Array.isArray(counts) && counts.length > 0;
        }).length;
        setCount(scouted);
      },
      () => setCount(null)
    );
    return () => unsub();
  }, [farmId]);

  if (!show) return null;

  const line =
    count == null
      ? 'Loading scouts…'
      : count === 0
        ? 'No paddock scouts yet'
        : `${count} paddock${count === 1 ? '' : 's'} scouted`;

  return (
    <DashboardCard href={WHEAT_YIELD_PRIMARY_PATH} label="Wheat yield" icon={Wheat} tone="watch">
      <div className="text-sm font-bold text-slate-900">{line}</div>
    </DashboardCard>
  );
}
