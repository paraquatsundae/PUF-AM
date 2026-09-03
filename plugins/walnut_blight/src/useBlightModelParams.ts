import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../src/firebase';
import { handleFirestoreError, OperationType } from '../../../src/lib/firestoreErrors';
import {
  defaultCalibration,
  growthStageFromDate,
  type CalibrationParams,
  type GrowthStage,
} from './blightModel';

export function useBlightModelParams(farmId: string | undefined, todayDate: Date) {
  const [growthStage, setGrowthStage] = useState<GrowthStage>(growthStageFromDate(todayDate));
  const [scoutingStage, setScoutingStage] = useState<GrowthStage | null>(null);
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [calib, setCalib] = useState<CalibrationParams>(defaultCalibration);
  const [loadingParams, setLoadingParams] = useState(true);
  const [isDebouncing, setIsDebouncing] = useState(false);
  const [debouncedParams, setDebouncedParams] = useState({
    growthStage,
    calib,
  });

  useEffect(() => {
    setIsDebouncing(true);
    const timer = setTimeout(() => {
      setDebouncedParams({ growthStage, calib });
      setIsDebouncing(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [growthStage, calib]);

  useEffect(() => {
    if (!farmId) {
      setLoadingParams(false);
      return;
    }
    const docRef = doc(db, 'farms', farmId, 'settings', 'model_params');
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const firestoreParams = docSnap.data();
          setCalib((prev) => ({ ...prev, ...firestoreParams }));
        }
        setLoadingParams(false);
      },
      (error) => {
        setLoadingParams(false);
        try {
          handleFirestoreError(error, OperationType.GET, `farms/${farmId}/settings/model_params`);
        } catch {
          /* already logged */
        }
      }
    );
    return () => unsubscribe();
  }, [farmId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setShowDevPanel((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!loadingParams) return;
    const t = setTimeout(() => setLoadingParams(false), 4000);
    return () => clearTimeout(t);
  }, [loadingParams]);

  return {
    growthStage,
    setGrowthStage,
    scoutingStage,
    setScoutingStage,
    showDevPanel,
    setShowDevPanel,
    calib,
    setCalib,
    loadingParams,
    isDebouncing,
    debouncedParams,
  };
}
