import { useCallback, useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../../src/firebase';
import { handleFirestoreError, OperationType } from '../../../src/lib/firestoreErrors';
import { isWorkshopMode } from '../../../src/lib/workshopMode';
import {
  loadWorkshopFarm,
  subscribeWorkshopFarm,
  writeWorkshopFarm,
} from '../../../src/lib/workshopFarmState';
import {
  bindingToWrite,
  parseSensorSettings,
  type SensorBinding,
  type SensorSettings,
} from '../../../shared/farm/sensorBindings';

/** Firestore subscribe for farms/{id}/settings/sensors. Seed empty bindings on first open. */
export function useSensorSettings(farmId: string | undefined, canWrite = false) {
  const [settings, setSettings] = useState<SensorSettings>({ bindings: {} });
  const [loading, setLoading] = useState(true);

  const workshop = isWorkshopMode();

  useEffect(() => {
    if (!workshop) return;
    const apply = () => {
      setSettings(loadWorkshopFarm().sensorSettings);
      setLoading(false);
    };
    apply();
    return subscribeWorkshopFarm(apply);
  }, [workshop]);

  useEffect(() => {
    if (workshop) return;
    if (!farmId) {
      setSettings({ bindings: {} });
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, 'farms', farmId, 'settings', 'sensors');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setSettings({ bindings: {} });
          if (canWrite) {
            void setDoc(ref, { bindings: {} }).catch((error) => {
              setLoading(false);
              try {
                handleFirestoreError(error, OperationType.WRITE, `farms/${farmId}/settings/sensors`);
              } catch {
                /* already logged */
              }
            });
            return;
          }
          setLoading(false);
          return;
        }
        setSettings(parseSensorSettings(snap.data()));
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        try {
          handleFirestoreError(error, OperationType.GET, `farms/${farmId}/settings/sensors`);
        } catch {
          /* already logged */
        }
      }
    );
    return () => unsub();
  }, [farmId, canWrite, workshop]);

  const saveBindings = useCallback(
    async (next: SensorSettings) => {
      if (workshop) {
        writeWorkshopFarm({ ...loadWorkshopFarm(), sensorSettings: next });
        return;
      }
      if (!farmId) return;
      const bindings: Record<string, Record<string, string>> = {};
      for (const [pinId, binding] of Object.entries(next.bindings)) {
        bindings[pinId] = bindingToWrite(binding);
      }
      await setDoc(doc(db, 'farms', farmId, 'settings', 'sensors'), { bindings });
    },
    [farmId, workshop]
  );

  const upsertBinding = useCallback(
    async (pinId: string, nextBinding: SensorBinding) => {
      const merged: SensorBinding = { source: nextBinding.source };
      if (nextBinding.externalId) merged.externalId = nextBinding.externalId;
      if (nextBinding.blockId) merged.blockId = nextBinding.blockId;
      const next: SensorSettings = {
        bindings: { ...settings.bindings, [pinId]: merged },
      };
      setSettings(next);
      try {
        await saveBindings(next);
      } catch (error) {
        try {
          handleFirestoreError(error, OperationType.WRITE, `farms/${farmId}/settings/sensors`);
        } catch {
          /* already logged */
        }
      }
    },
    [farmId, saveBindings, settings.bindings]
  );

  return { settings, loading, upsertBinding };
}
