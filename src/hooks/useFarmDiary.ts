import { useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { irrigationEventsByDate, sprayEventsByDate } from '../lib/farmDiaryAnalytics';
import type { DiaryEvent, FarmSettings } from '../lib/farmDiaryTypes';
import { useFarmDiaryStore } from '../lib/farmDiaryStore';

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

  const addEvent = useCallback(
    (event: Omit<DiaryEvent, 'id'>) => {
      if (farmId) store.addEvent(farmId, canEdit, event);
    },
    [farmId, canEdit, store.addEvent]
  );

  const updateEvent = useCallback(
    (id: string, updates: Partial<DiaryEvent>) => {
      if (farmId) store.updateEvent(farmId, canEdit, id, updates);
    },
    [farmId, canEdit, store.updateEvent]
  );

  const removeEvent = useCallback(
    (id: string) => {
      if (farmId) store.removeEvent(farmId, canEdit, id);
    },
    [farmId, canEdit, store.removeEvent]
  );

  const updateSettings = useCallback(
    (newSettings: Partial<FarmSettings>) => {
      if (farmId) store.updateSettings(farmId, canEdit, newSettings);
    },
    [farmId, canEdit, store.updateSettings]
  );

  const getSprayEvents = useCallback(
    (targetBlockId?: string) => sprayEventsByDate(store.events, targetBlockId),
    [store.events]
  );

  const getIrrigationEvents = useCallback(
    (targetBlockId?: string) => irrigationEventsByDate(store.events, targetBlockId),
    [store.events]
  );

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
    canEdit,
  };
}
