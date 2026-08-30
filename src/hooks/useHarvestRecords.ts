import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import type { HarvestRecord } from '../lib/harvestRecords';

export type HarvestFormDraft = {
  date: string;
  totalWeight: string;
  moistureContent: string;
  qualityGrade: string;
  notes: string;
};

export function useHarvestRecords(farmId: string | undefined, uid: string | undefined) {
  const [records, setRecords] = useState<HarvestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!farmId) {
      setLoading(false);
      return;
    }
    const q = query(collection(db, 'farms', farmId, 'harvests'), orderBy('date', 'desc'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        setRecords(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as HarvestRecord)));
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching harvests:', error);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [farmId]);

  const createRecord = async (blockId: string, formData: HarvestFormDraft): Promise<boolean> => {
    if (!farmId || !uid) return false;
    setSaving(true);
    try {
      const harvestRef = doc(collection(db, 'farms', farmId, 'harvests'));
      const newRecord = {
        id: harvestRef.id,
        date: formData.date,
        blockId,
        totalWeight: Number(formData.totalWeight),
        moistureContent: Number(formData.moistureContent) || 0,
        qualityGrade: formData.qualityGrade || '',
        notes: formData.notes || '',
        createdAt: new Date().toISOString(),
        createdBy: uid,
      };
      await setDoc(harvestRef, newRecord);
      return true;
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.CREATE, `farms/${farmId}/harvests`);
      } catch {
        /* logged */
      }
      return false;
    } finally {
      setSaving(false);
    }
  };

  const deleteRecord = async (id: string) => {
    if (!farmId || !window.confirm('Delete this harvest record?')) return;
    try {
      await deleteDoc(doc(db, 'farms', farmId, 'harvests', id));
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, `farms/${farmId}/harvests/${id}`);
      } catch {
        /* logged */
      }
    }
  };

  return { records, loading, saving, createRecord, deleteRecord };
}
