import { create } from 'zustand';
import { diaryApi } from '../services/api';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import type { DiaryEvent, FarmSettings } from './farmDiaryTypes';
import { getDefaultDiaryStartDate } from './farmDiaryTypes';

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

export const useFarmDiaryStore = create<FarmDiaryState>((set, get) => ({
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
    if (
      state.isLoaded &&
      !state.isLoading &&
      state.currentFarmId === farmId &&
      state.currentStartDate === (startDate || null) &&
      state.currentEndDate === (endDate || null)
    ) {
      return;
    }

    set({
      isLoading: true,
      error: null,
      currentFarmId: farmId,
      currentStartDate: startDate || null,
      currentEndDate: endDate || null,
      lastDoc: null,
      hasMore: false,
    });
    const { listLocalEntities } = await import('./localFarmRepo');
    const { mergeByLww } = await import('../../shared/sync/pufomBundle');
    try {
      const effectiveStart = startDate || getDefaultDiaryStartDate(90);
      const localEvents = await listLocalEntities<DiaryEvent>(farmId, 'diary');
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

      const { mergeFarmSettings, readLocalFarmSettings } = await import('./farmSettingsLocal');

      if (isOffline) {
        const filtered = localEvents
          .filter((e) => e.date >= effectiveStart && (!endDate || e.date <= endDate))
          .sort((a, b) => b.date.localeCompare(a.date));
        set({
          events: filtered,
          settings: mergeFarmSettings(null, readLocalFarmSettings(farmId), get().settings),
          isLoaded: true,
          isLoading: false,
          hasMore: false,
          lastDoc: null,
        });
        return;
      }

      const [page, savedSettings] = await Promise.all([
        diaryApi.getEventsPaginated(farmId, { startDate: effectiveStart, endDate, limit: 50 }),
        diaryApi.getSettings(farmId),
      ]);

      const merged = mergeByLww(page.items || [], localEvents).sort((a, b) => b.date.localeCompare(a.date));
      const { replaceLocalEntities } = await import('./localFarmRepo');
      await replaceLocalEntities(farmId, 'diary', merged);
      const settings = mergeFarmSettings(savedSettings, readLocalFarmSettings(farmId), get().settings);

      set({
        events: merged,
        settings,
        isLoaded: true,
        isLoading: false,
        hasMore: page.hasMore,
        lastDoc: page.lastDoc,
      });
    } catch (err) {
      console.error('Failed to load farm diary data:', err);
      try {
        const localEvents = await listLocalEntities<DiaryEvent>(farmId, 'diary');
        set({
          events: localEvents.sort((a, b) => b.date.localeCompare(a.date)),
          error: 'Cloud diary unavailable — showing local copy',
          isLoaded: true,
          isLoading: false,
        });
      } catch {
        set({ error: 'Failed to load farm diary data', isLoading: false });
      }
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
      updatedAt: new Date().toISOString(),
    };

    set((state) => ({
      events: [newEvent, ...state.events].sort((a, b) => b.date.localeCompare(a.date)),
    }));

    const { upsertLocalEntity } = await import('./localFarmRepo');
    await upsertLocalEntity(farmId, 'diary', newEvent, { queueCloud: true });

    const { scheduleMistHotAutoPublish } = await import('../mist/mistHotBridge');
    scheduleMistHotAutoPublish(farmId);

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      await diaryApi.saveEvent(farmId, newEvent);
    } catch (err) {
      console.warn('[farmDiary.addEvent] Cloud save deferred to outbox', err);
    }
  },

  updateEvent: async (farmId, canEdit, id, updates) => {
    if (!farmId || !canEdit) return;
    const previous = get().events;
    const next = previous.map((e) => {
      if (e.id !== id) return e;
      const merged: DiaryEvent = {
        ...e,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
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

    const { upsertLocalEntity } = await import('./localFarmRepo');
    await upsertLocalEntity(farmId, 'diary', updated, { queueCloud: true });

    const { scheduleMistHotAutoPublish } = await import('../mist/mistHotBridge');
    scheduleMistHotAutoPublish(farmId);

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      await diaryApi.saveEvent(farmId, updated);
    } catch (err) {
      console.warn('[farmDiary.updateEvent] Cloud save deferred to outbox', err);
    }
  },

  removeEvent: async (farmId, canEdit, id) => {
    if (!farmId || !canEdit) return;
    set((state) => ({
      events: state.events.filter((e) => e.id !== id),
    }));

    const { deleteLocalEntity } = await import('./localFarmRepo');
    await deleteLocalEntity(farmId, 'diary', id, { queueCloud: true });

    const { scheduleMistHotAutoPublish } = await import('../mist/mistHotBridge');
    scheduleMistHotAutoPublish(farmId);

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      await diaryApi.deleteEvent(farmId, id);
    } catch (err) {
      console.warn('[farmDiary.removeEvent] Cloud delete deferred to outbox', err);
    }
  },

  updateSettings: async (farmId, canEdit, newSettings) => {
    if (!canEdit) return;
    const previousSettings = get().settings;
    const updatedSettings = { ...previousSettings, ...newSettings };
    set({ settings: updatedSettings });

    if (farmId) {
      try {
        const { writeLocalFarmSettings } = await import('./farmSettingsLocal');
        writeLocalFarmSettings(farmId, updatedSettings);
      } catch {
        /* ignore local backup failures */
      }
      try {
        await diaryApi.saveSettings(farmId, updatedSettings);
      } catch (err) {
        console.error('Failed to save settings:', err);
      }
    }
  },
}));

/** Force reload diary from pufom_farm_local (e.g. after mist disaster-recovery rehydrate). */
export function forceReloadFarmDiary(farmId: string, startDate?: string, endDate?: string): void {
  useFarmDiaryStore.setState({ isLoaded: false, isLoading: true });
  void useFarmDiaryStore.getState().loadData(farmId, startDate, endDate);
}
