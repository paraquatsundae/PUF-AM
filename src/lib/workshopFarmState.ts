/**
 * Workshop-only farm catalog and sensor bindings (no Firestore).
 * Plans/FARM_TYPES.md § Map infrastructure. Hosted farms do not read this.
 */
import { allFarmModules, type FarmModuleId } from '../../shared/auth/farmModules';
import type { FarmCropPacksMap } from '../../shared/farm/cropPacks';
import { parseSensorSettings, type SensorSettings } from '../../shared/farm/sensorBindings';
import {
  emptyFieldBinSettings,
  parseFieldBinMovements,
  parseFieldBinSettings,
  type FieldBinMovement,
  type FieldBinSettings,
} from '../../shared/farm/fieldBinStock';

const KEY = 'pufam.workshop.farm';
const EVENT = 'pufam-workshop-farm';

export type WorkshopFarmState = {
  cropPacks: FarmCropPacksMap;
  modules: FarmModuleId[];
  sensorSettings: SensorSettings;
  fieldBinSettings: FieldBinSettings;
  fieldBinMovements: FieldBinMovement[];
};

export function emptyWorkshopFarm(): WorkshopFarmState {
  return {
    cropPacks: {},
    modules: allFarmModules(),
    sensorSettings: { bindings: {} },
    fieldBinSettings: emptyFieldBinSettings(),
    fieldBinMovements: [],
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
      sensorSettings: parseSensorSettings(parsed.sensorSettings),
      fieldBinSettings: parseFieldBinSettings(parsed.fieldBinSettings),
      fieldBinMovements: parseFieldBinMovements(parsed.fieldBinMovements),
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
