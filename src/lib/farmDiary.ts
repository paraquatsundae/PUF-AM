import { create } from 'zustand';
import { diaryApi } from '../services/api';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useEffect, useCallback } from 'react';

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
}

interface FarmDiaryState {
  events: DiaryEvent[];
  settings: FarmSettings;
  isLoaded: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  error: string | null;
  currentFarmId: string | null;
  currentStartDate: string | null;
  currentEndDate: string | null;
  setEvents: (events: DiaryEvent[]) => void;
  setSettings: (settings: FarmSettings) => void;
  addEvent: (farmId: string, canEdit: boolean, event: Omit<DiaryEvent, 'id'>) => Promise<void>;
  updateEvent: (farmId: string, canEdit: boolean, id: string, updates: Partial<DiaryEvent>) => Promise<void>;
  removeEvent: (farmId: string, canEdit: boolean, id: string) => Promise<void>;
  updateSettings: (farmId: string, canEdit: boolean, newSettings: Partial<FarmSettings>) => Promise<void>;
  loadData: (farmId: string, startDate?: string, endDate?: string) => Promise<void>;
  loadMore: (farmId: string) => Promise<void>;
}

const useFarmDiaryStore = create<FarmDiaryState>((set, get) => ({
  events: [],
  settings: { irrigationSystemType: 'micro', farmName: '' },
  isLoaded: false,
  isLoading: true,
  isLoadingMore: false,
  hasMore: false,
  lastDoc: null,
  error: null,
  currentFarmId: null,
  currentStartDate: null,
  currentEndDate: null,

  setEvents: (events) => set({ events }),
  setSettings: (settings) => set({ settings }),

  loadData: async (farmId: string, startDate?: string, endDate?: string) => {
    const state = get();
    if (state.isLoaded && !state.isLoading && state.currentFarmId === farmId && state.currentStartDate === (startDate || null) && state.currentEndDate === (endDate || null)) return;
    
    set({ isLoading: true, error: null, currentFarmId: farmId, currentStartDate: startDate || null, currentEndDate: endDate || null, lastDoc: null, hasMore: false });
    try {
      const effectiveStart = startDate || getDefaultDiaryStartDate(90);
      const [page, savedSettings] = await Promise.all([
        diaryApi.getEventsPaginated(farmId, { startDate: effectiveStart, endDate, limit: 50 }),
        diaryApi.getSettings(farmId)
      ]);
      
      set({ 
        events: page.items || [], 
        settings: savedSettings || { irrigationSystemType: 'micro', farmName: '' },
        isLoaded: true,
        isLoading: false,
        hasMore: page.hasMore,
        lastDoc: page.lastDoc,
      });
    } catch (err) {
      console.error('Failed to load farm diary data:', err);
      set({ error: 'Failed to load farm diary data', isLoading: false });
    }
  },

  loadMore: async (farmId: string) => {
    const state = get();
    if (!state.hasMore || state.isLoadingMore || !state.lastDoc) return;

    set({ isLoadingMore: true });
    try {
      const page = await diaryApi.getEventsPaginated(farmId, {
        startDate: state.currentStartDate || getDefaultDiaryStartDate(90),
        endDate: state.currentEndDate || undefined,
        startAfterDoc: state.lastDoc,
        limit: 50,
      });

      set({
        events: [...state.events, ...page.items],
        hasMore: page.hasMore,
        lastDoc: page.lastDoc,
        isLoadingMore: false,
      });
    } catch (err) {
      console.error('Failed to load more diary events:', err);
      set({ isLoadingMore: false });
    }
  },

  addEvent: async (farmId, canEdit, event) => {
    if (!farmId || !canEdit) return;
    const newEvent: DiaryEvent = {
      ...event,
      id: crypto.randomUUID(),
      status: event.status ?? (event.type === 'work' ? 'planned' : 'done'),
    };
    
    set(state => ({
      events: [newEvent, ...state.events].sort((a, b) => b.date.localeCompare(a.date))
    }));
    
    try {
      await diaryApi.saveEvent(farmId, newEvent);
    } catch (err) {
      console.error('Failed to save event:', err);
      // Rollback on failure
      set(state => ({
        events: state.events.filter(e => e.id !== newEvent.id)
      }));
    }
  },

  updateEvent: async (farmId, canEdit, id, updates) => {
    if (!farmId || !canEdit) return;
    const previous = get().events;
    const next = previous.map((e) => {
      if (e.id !== id) return e;
      const merged: DiaryEvent = { ...e, ...updates };
      // Allow clearing optional fields with `undefined` (e.g. unlink issue)
      for (const key of Object.keys(updates) as (keyof DiaryEvent)[]) {
        if (updates[key] === undefined) {
          delete (merged as unknown as Record<string, unknown>)[key as string];
        }
      }
      return merged;
    });
    set({ events: next.sort((a, b) => b.date.localeCompare(a.date)) });
    const updated = next.find((e) => e.id === id);
    if (!updated) return;
    try {
      await diaryApi.saveEvent(farmId, updated);
    } catch (err) {
      console.error('Failed to update event:', err);
      set({ events: previous });
    }
  },

  removeEvent: async (farmId, canEdit, id) => {
    if (!farmId || !canEdit) return;
    const previousEvents = get().events;
    set(state => ({
      events: state.events.filter(e => e.id !== id)
    }));
    
    try {
      await diaryApi.deleteEvent(farmId, id);
    } catch (err) {
      console.error('Failed to delete event:', err);
      // Rollback on failure
      set({ events: previousEvents });
    }
  },

  updateSettings: async (farmId, canEdit, newSettings) => {
    if (!canEdit) return;
    const previousSettings = get().settings;
    const updatedSettings = { ...previousSettings, ...newSettings };
    set({ settings: updatedSettings });
    
    if (farmId) {
      try {
        await diaryApi.saveSettings(farmId, updatedSettings);
      } catch (err) {
        console.error('Failed to save settings:', err);
        set({ settings: previousSettings });
      }
    }
  }
}));

export function useFarmDiary(startDate?: string, endDate?: string) {
  const { userData } = useAuth();
  const farmId = userData?.farmId;
  const canEdit = userData?.role === 'admin' || userData?.role === 'farmer';

  const store = useFarmDiaryStore();

  useEffect(() => {
    if (farmId) {
      store.loadData(farmId, startDate, endDate);
    }
  }, [farmId, startDate, endDate]);

  const addEvent = useCallback((event: Omit<DiaryEvent, 'id'>) => {
    if (farmId) store.addEvent(farmId, canEdit, event);
  }, [farmId, canEdit, store.addEvent]);

  const updateEvent = useCallback((id: string, updates: Partial<DiaryEvent>) => {
    if (farmId) store.updateEvent(farmId, canEdit, id, updates);
  }, [farmId, canEdit, store.updateEvent]);

  const removeEvent = useCallback((id: string) => {
    if (farmId) store.removeEvent(farmId, canEdit, id);
  }, [farmId, canEdit, store.removeEvent]);

  const updateSettings = useCallback((newSettings: Partial<FarmSettings>) => {
    if (farmId) store.updateSettings(farmId, canEdit, newSettings);
  }, [farmId, canEdit, store.updateSettings]);

  const getSprayEvents = useCallback((targetBlockId?: string) => {
    const sprayMap: Record<string, { type: SprayType; method: ApplicationMethod }> = {};
    
    // Sort events by date ascending to process them chronologically
    const sortedEvents = [...store.events].sort((a, b) => a.date.localeCompare(b.date));

    sortedEvents.forEach(e => {
      if (e.type === 'spray' && e.sprayType) {
        // Filter by block if targetBlockId is provided. Include general events (no blockId) for all blocks.
        if (!targetBlockId || !e.blockId || e.blockId === targetBlockId) {
          const existing = sprayMap[e.date];
          const currentMethod = e.applicationMethod || 'ground';

          if (existing) {
            // 1. Merge Spray Types
            // If a block receives both chemical and biological sprays on the same day,
            // we classify the protection as 'both' for analytics purposes.
            let mergedType: SprayType = existing.type;
            if (existing.type !== e.sprayType) {
              if ((existing.type === 'chem' && e.sprayType === 'bio') || 
                  (existing.type === 'bio' && e.sprayType === 'chem') ||
                  existing.type === 'both' || e.sprayType === 'both') {
                mergedType = 'both';
              }
            }
            
            // 2. Prioritize Application Method
            // Different application methods provide different levels of canopy penetration and coverage.
            // When multiple sprays happen on the same day, we record the method with the highest penetration priority
            // to accurately model the maximum protection achieved.
            const methodPriority: Record<ApplicationMethod, number> = {
              'helicopter': 4, // Highest penetration due to rotor downwash
              'drone': 3,      // Good penetration, lower volume
              'aeroplane': 2,  // Fast coverage, lower penetration than rotary
              'ground': 1      // Standard baseline coverage
            };
            
            const mergedMethod = methodPriority[currentMethod] > methodPriority[existing.method] 
              ? currentMethod 
              : existing.method;

            sprayMap[e.date] = { 
              type: mergedType, 
              method: mergedMethod 
            };
          } else {
            // First spray for this date
            sprayMap[e.date] = { 
              type: e.sprayType, 
              method: currentMethod 
            };
          }
        }
      }
    });
    return sprayMap;
  }, [store.events]);

  const getIrrigationEvents = useCallback((targetBlockId?: string) => {
    const irrigationMap: Record<string, number> = {};
    store.events.forEach(e => {
      if (e.type === 'irrigation' && e.irrigationAmount !== undefined) {
        // Include general events (no blockId) for all blocks
        if (!targetBlockId || !e.blockId || e.blockId === targetBlockId) {
          irrigationMap[e.date] = (irrigationMap[e.date] || 0) + e.irrigationAmount;
        }
      }
    });
    return irrigationMap;
  }, [store.events]);

  return {
    events: store.events,
    settings: store.settings,
    addEvent,
    updateEvent,
    removeEvent,
    updateSettings,
    getSprayEvents,
    getIrrigationEvents,
    loadMore: useCallback(() => {
      if (farmId) store.loadMore(farmId);
    }, [farmId, store.loadMore]),
    hasMore: store.hasMore,
    isLoadingMore: store.isLoadingMore,
    isLoaded: store.isLoaded,
    isLoading: store.isLoading,
    error: store.error,
    canEdit
  };
}
