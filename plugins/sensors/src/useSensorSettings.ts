import { useCallback, useEffect, useRef, useState } from 'react';
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
  const pendingRef = useRef<SensorSettings | null>(null);

  useEffect(() => {
    if (!workshop) return;
    const apply = () => {
      if (pendingRef.current) return;
      setSettings(parseSensorSettings(loadWorkshopFarm().sensorSettings));
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
        if (!pendingRef.current) setSettings(parseSensorSettings(snap.data()));
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
      const parsed = parseSensorSettings(next);
      if (workshop) {
        writeWorkshopFarm({ ...loadWorkshopFarm(), sensorSettings: parsed });
        return;
      }
      if (!farmId) return;
      const bindings: Record<string, ReturnType<typeof bindingToWrite>> = {};
      for (const [pinId, binding] of Object.entries(parsed.bindings)) {
        bindings[pinId] = bindingToWrite(binding);
      }
      await setDoc(doc(db, 'farms', farmId, 'settings', 'sensors'), { bindings });
    },
    [farmId, workshop]
  );

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) void saveBindings(pending);
    };
  }, [saveBindings]);

  const upsertBinding = useCallback(
    async (pinId: string, nextBinding: SensorBinding) => {
      const merged = parseSensorSettings({ bindings: { [pinId]: nextBinding } }).bindings[pinId] ?? {
        source: nextBinding.source,
      };
      const next: SensorSettings = {
        bindings: { ...settingsRef.current.bindings, [pinId]: merged },
      };
      settingsRef.current = next;
      pendingRef.current = next;
      setSettings(next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const body = pendingRef.current;
        saveTimer.current = null;
        if (!body) return;
        void saveBindings(body)
          .catch((error) => {
            try {
              handleFirestoreError(error, OperationType.WRITE, `farms/${farmId}/settings/sensors`);
            } catch {
              /* already logged */
            }
          })
          .finally(() => {
            if (pendingRef.current === body) pendingRef.current = null;
          });
      }, 250);
    },
    [farmId, saveBindings]
  );

  return { settings, loading, upsertBinding };
}
