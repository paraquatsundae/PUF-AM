/**
 * One loss document per paddock: farms/{farmId}/wheat_yield_loss/{blockId}.
 * Several calculations, each with its own drops. Pack Delete does not wipe this.
 * Plans/WHEAT_YIELD_PLUGIN.md.
 */
import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../../src/firebase';
import { parseCustomTrays, parseHarvestLossCalculations, type CustomTray, type HarvestLossCalculation } from './estimateHarvestLoss';

export const WHEAT_YIELD_LOSS_COLLECTION = 'wheat_yield_loss';

export type HarvestLossDoc = {
  blockId: string;
  calculations: HarvestLossCalculation[];
  trays: CustomTray[];
  updatedAt: string;
  updatedBy: string;
};

export function useHarvestLoss(farmId: string | undefined, blockId: string | undefined) {
  const [record, setRecord] = useState<HarvestLossDoc | null>(null);
  const [loading, setLoading] = useState(Boolean(farmId && blockId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!farmId || !blockId) {
      setRecord(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, 'farms', farmId, WHEAT_YIELD_LOSS_COLLECTION, blockId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setRecord(null);
        } else {
          const data = snap.data();
          setRecord({
            blockId,
            calculations: parseHarvestLossCalculations(data.calculations),
            trays: parseCustomTrays(data.trays),
            updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
            updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : '',
          });
        }
        setLoading(false);
      },
      (err) => {
        console.error('[wheat_yield] loss read failed', err);
        setError('Could not load this paddock’s harvest loss.');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [farmId, blockId]);

  const save = async (uid: string, calculations: HarvestLossCalculation[], trays: CustomTray[]): Promise<boolean> => {
    if (!farmId || !blockId) return false;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        blockId,
        calculations: parseHarvestLossCalculations(calculations),
        trays: parseCustomTrays(trays),
        updatedAt: new Date().toISOString(),
        updatedBy: uid,
      };
      await setDoc(doc(db, 'farms', farmId, WHEAT_YIELD_LOSS_COLLECTION, blockId), payload);
      return true;
    } catch (err) {
      console.error('[wheat_yield] loss save failed', err);
      setError('Could not save this harvest loss.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { record, loading, saving, error, save };
}
