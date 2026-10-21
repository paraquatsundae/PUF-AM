/**
 * Workshop-only farm catalog and sensor bindings (no Firestore).
 * Plans/FARM_TYPES.md § Map infrastructure. Hosted farms do not read this.
 */
import { allFarmModules, type FarmModuleId } from '../../shared/auth/farmModules';
import type { FarmCropPacksMap } from '../../shared/farm/cropPacks';
import type { SensorSettings } from '../../shared/farm/sensorBindings';

const KEY = 'pufam.workshop.farm';
const EVENT = 'pufam-workshop-farm';

export type WorkshopFarmState = {
  cropPacks: FarmCropPacksMap;
  modules: FarmModuleId[];
  sensorSettings: SensorSettings;
};

export function emptyWorkshopFarm(): WorkshopFarmState {
  return {
    cropPacks: {},
    modules: allFarmModules(),
    sensorSettings: { bindings: {} },
  };
}

export function readWorkshopFarm(): WorkshopFarmState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkshopFarmState>;
    const seeded = emptyWorkshopFarm();
    return {
      cropPacks: parsed.cropPacks && typeof parsed.cropPacks === 'object' ? parsed.cropPacks : {},
      modules: Array.isArray(parsed.modules) ? (parsed.modules as FarmModuleId[]) : seeded.modules,
      sensorSettings:
        parsed.sensorSettings && typeof parsed.sensorSettings === 'object'
          ? parsed.sensorSettings
          : seeded.sensorSettings,
    };
  } catch {
    return null;
  }
}

export function loadWorkshopFarm(): WorkshopFarmState {
  return readWorkshopFarm() ?? emptyWorkshopFarm();
}

export function writeWorkshopFarm(state: WorkshopFarmState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeWorkshopFarm(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}
