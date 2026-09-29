/**
 * One scout document per paddock: farms/{farmId}/wheat_yield/{blockId}.
 * Farmers write it. Pack Delete does not wipe this collection (same as harvests).
 */
import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../../src/firebase';
import type { HeadCount } from './estimateYield';

export const WHEAT_YIELD_COLLECTION = 'wheat_yield';
const MAX_COUNTS = 30;

export type WheatScoutDoc = {
  blockId: string;
  hectolitreWeight: number;
  deductionPercent: number;
  hectares: number;
  thousandGrainWeightOverride: number;
  counts: HeadCount[];
  updatedAt: string;
  updatedBy: string;
};

function finite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function wheatScoutFromFirestore(blockId: string, data: Record<string, unknown>): WheatScoutDoc {
  const rawCounts = Array.isArray(data.counts) ? data.counts : [];
  const counts: HeadCount[] = [];
  for (const row of rawCounts) {
    if (!row || typeof row !== 'object') continue;
    const count = row as Record<string, unknown>;
    counts.push({
      heads: finite(count.heads),
      height: finite(count.height),
      width: finite(count.width),
    });
  }
  return {
    blockId,
    hectolitreWeight: finite(data.hectolitreWeight, 74),
    deductionPercent: finite(data.deductionPercent, 10),
    hectares: finite(data.hectares),
    thousandGrainWeightOverride: finite(data.thousandGrainWeightOverride),
    counts: counts.slice(0, MAX_COUNTS),
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : '',
  };
}

export function useWheatScout(farmId: string | undefined, blockId: string | undefined) {
  const [record, setRecord] = useState<WheatScoutDoc | null>(null);
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
    const ref = doc(db, 'farms', farmId, WHEAT_YIELD_COLLECTION, blockId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setRecord(snap.exists() ? wheatScoutFromFirestore(blockId, snap.data()) : null);
        setLoading(false);
      },
      (err) => {
        console.error('[wheat_yield] scout read failed', err);
        setError('Could not load this paddock’s scout.');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [farmId, blockId]);

  const save = async (uid: string, draft: Omit<WheatScoutDoc, 'updatedAt' | 'updatedBy'>): Promise<boolean> => {
    if (!farmId || !blockId) return false;
    setSaving(true);
    setError(null);
    try {
      const payload: WheatScoutDoc = {
        blockId,
        hectolitreWeight: draft.hectolitreWeight,
        deductionPercent: draft.deductionPercent,
        hectares: draft.hectares,
        thousandGrainWeightOverride: draft.thousandGrainWeightOverride,
        counts: draft.counts.slice(0, MAX_COUNTS).map((count) => ({
          heads: count.heads,
          height: count.height,
          width: count.width,
        })),
        updatedAt: new Date().toISOString(),
        updatedBy: uid,
      };
      await setDoc(doc(db, 'farms', farmId, WHEAT_YIELD_COLLECTION, blockId), payload);
      return true;
    } catch (err) {
      console.error('[wheat_yield] scout save failed', err);
      setError('Could not save this scout.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { record, loading, saving, error, save };
}
