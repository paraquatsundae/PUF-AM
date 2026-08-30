import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import {
  DEFAULT_MODEL_PARAMS,
  defaultEconomicsModelParams,
  pickEconomicsModelParams,
  type EconomicsModelParams,
  type ModelParameters,
} from '../lib/modelParameters';

export function useFarmEconomicsSettings(farmId: string | undefined, canSave: boolean) {
  const [economics, setEconomics] = useState<EconomicsModelParams>(defaultEconomicsModelParams());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!farmId) return;

    const docRef = doc(db, 'farms', farmId, 'settings', 'model_params');

    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const merged = {
            ...DEFAULT_MODEL_PARAMS,
            ...docSnap.data(),
          } as ModelParameters;
          setEconomics(pickEconomicsModelParams(merged));
        } else {
          setEconomics(defaultEconomicsModelParams());
        }
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        try {
          handleFirestoreError(error, OperationType.GET, `farms/${farmId}/settings/model_params`);
        } catch {
          /* already logged */
        }
      }
    );

    return () => unsubscribe();
  }, [farmId]);

  const saveEconomics = async () => {
    if (!farmId || !canSave) return;

    setSaving(true);
    setMessage(null);

    try {
      const docRef = doc(db, 'farms', farmId, 'settings', 'model_params');
      await setDoc(docRef, pickEconomicsModelParams({ ...DEFAULT_MODEL_PARAMS, ...economics }), {
        merge: true,
      });
      setMessage({ type: 'success', text: 'Market & economics saved.' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save. Check permissions.' });
      try {
        handleFirestoreError(error, OperationType.WRITE, `farms/${farmId}/settings/model_params`);
      } catch {
        /* already logged */
      }
    } finally {
      setSaving(false);
    }
  };

  return { economics, setEconomics, loading, saving, message, saveEconomics };
}
