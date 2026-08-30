import type { FarmProfile } from '../../shared/farm/farmTypes';
import { resolveFarmProfile } from '../../shared/farm/farmTypes';

export type { FarmProfile };
export { resolveFarmProfile };

export function getDefaultDiaryStartDate(days = 90): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export type SprayType = 'chem' | 'bio' | 'both';
export type ApplicationMethod = 'ground' | 'drone' | 'helicopter' | 'aeroplane';
export type IrrigationSystemType = 'micro' | 'surface_drip' | 'sub_surface' | 'flood';
/** Record = already happened; planned = upcoming work; cancelled = dropped plan. */
export type DiaryEntryStatus = 'planned' | 'done' | 'cancelled';
export type WorkPriority = 'low' | 'medium' | 'high';
export type NutritionRateUnit = 'kg/ha' | 'L/ha' | 'kg' | 'L';
export type NutritionMethod = 'broadcast' | 'fertigation' | 'foliar' | 'banding';

export interface DiaryEvent {
  id: string;
  date: string;
  type: 'spray' | 'irrigation' | 'work' | 'nutrition';
  /** Spray/irrigation/nutrition default to done; work plans use planned until completed. */
  status?: DiaryEntryStatus;
  blockId?: string;
  sprayType?: SprayType;
  applicationMethod?: ApplicationMethod;
  agentName?: string;
  carrier?: string;
  adjuvant?: string;
  irrigationAmount?: number;
  durationMinutes?: number;
  notes?: string;
  /** Fertilizer / nutrient application */
  productName?: string;
  rate?: number;
  rateUnit?: NutritionRateUnit;
  nRate?: number;
  pRate?: number;
  kRate?: number;
  nutritionMethod?: NutritionMethod;
  /** Planned / assigned work */
  title?: string;
  assignedTo?: string;
  assignedToName?: string;
  priority?: WorkPriority;
  safetyChecklistAccepted?: boolean;
  acceptedAt?: string;
  completedAt?: string;
  /** Field issue this work plan was created from (map / Issues tab). */
  linkedIssueId?: string;
  /** LWW / outbox stamp */
  updatedAt?: string;
}

export interface FarmSettings {
  irrigationSystemType: IrrigationSystemType;
  /** Seasonal water right / allocation in megalitres. */
  waterAllocationMl?: number;
  farmName?: string;
  customChemicals?: string[];
  customBiologicals?: string[];
  customCarriers?: string[];
  customAdjuvants?: string[];
  /** Enterprises + livestock overlay — see shared/farm/farmTypes.ts */
  farmProfile?: FarmProfile;
  /**
   * Preferred DPIRD station for chill / weather (e.g. MA002).
   * Empty / unset → nearest regional anchor to the map viewport.
   */
  dpirdStationCode?: string;
  /** Display name for the preferred DPIRD station (optional). */
  dpirdStationName?: string;
  /**
   * Default timed “check this” highlight duration for viewers (and as farm default).
   * Admin/farmer can override per-send; viewers always use this fixed value.
   */
  highlightDefaultSeconds?: number;
}
