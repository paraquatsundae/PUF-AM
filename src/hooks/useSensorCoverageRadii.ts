import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { parseSensorSettings } from '../../shared/farm/sensorBindings';
import { db } from '../firebase';
import { loadWorkshopFarm, subscribeWorkshopFarm } from '../lib/workshopFarmState';
import { isWorkshopMode } from '../lib/workshopMode';

function radiiFromSettings(input: unknown): Record<string, number> {
  const settings = parseSensorSettings(input);
  const radii: Record<string, number> = {};
  for (const [pinId, binding] of Object.entries(settings.bindings)) {
    if (typeof binding.radiusM === 'number') radii[pinId] = binding.radiusM;
  }
  return radii;
}

/** Per-pin coverage radius from settings/sensors. Missing pins keep the class default. */
export function useSensorCoverageRadii(farmId: string | undefined): Record<string, number> {
  const [radii, setRadii] = useState<Record<string, number>>({});
  const workshop = isWorkshopMode();

  useEffect(() => {
    if (!workshop) return;
    const apply = () => setRadii(radiiFromSettings(loadWorkshopFarm().sensorSettings));
    apply();
    return subscribeWorkshopFarm(apply);
  }, [workshop]);

  useEffect(() => {
    if (workshop || !farmId) return;
    const ref = doc(db, 'farms', farmId, 'settings', 'sensors');
    return onSnapshot(
      ref,
      (snap) => setRadii(snap.exists() ? radiiFromSettings(snap.data()) : {}),
      () => setRadii({})
    );
  }, [farmId, workshop]);

  return radii;
}
