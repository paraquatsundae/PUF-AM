import type { DiaryEvent, FarmSettings } from '../lib/farmDiary';
import { db } from '../firebase';
import { collection, doc, getDocs, getDoc, setDoc, deleteDoc, query, where, getDocsFromCache, getDocFromCache, orderBy, limit, startAfter, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { isLocalOnlyFarmSession } from '../lib/workshopMode';
import { handleFirestoreError, isBenignFirestoreFailure, OperationType } from '../lib/firestoreErrors';
import { isOffline } from './firestoreOffline';

export interface PaginatedResult<T> {
  items: T[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export interface PaginationOptions {
  limit?: number;
  startAfterDoc?: QueryDocumentSnapshot<DocumentData> | null;
  startDate?: string;
  endDate?: string;
}

const DEFAULT_PAGE_SIZE = 50;

export const safetyApi = {
  getChecklist: async (farmId: string): Promise<any | null> => {
    if (isLocalOnlyFarmSession()) return null;
    try {
      const path = `farms/${farmId}/settings`;
      const docSnap = await getDoc(doc(db, path, 'safety'));
      return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
      if (isBenignFirestoreFailure(error)) return null;
      handleFirestoreError(error, OperationType.GET, `farms/${farmId}/settings/safety`);
      return null;
    }
  },
  saveChecklist: async (farmId: string, checklist: any): Promise<void> => {
    if (isLocalOnlyFarmSession()) return;
    try {
      const path = `farms/${farmId}/settings`;
      const dataToSave = { ...checklist, updatedAt: new Date().toISOString() };
      await setDoc(doc(db, path, 'safety'), dataToSave);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `farms/${farmId}/settings/safety`);
    }
  }
};

// --- Nutrition Data ---
export const nutritionApi = {
  getNutritionData: async (farmId: string): Promise<any> => {
    if (isLocalOnlyFarmSession()) return [];
    try {
      const path = `farms/${farmId}/nutrition_data`;
      const q = collection(db, path);
      const snapshot = isOffline() ? await getDocsFromCache(q) : await getDocs(q);
      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      if (isOffline() || isBenignFirestoreFailure(error)) return [];
      handleFirestoreError(error, OperationType.LIST, `farms/${farmId}/nutrition_data`);
      return [];
    }
  }
};

// --- Water Data ---
export const waterApi = {
  getWaterData: async (farmId: string): Promise<any> => {
    if (isLocalOnlyFarmSession()) return null;
    try {
      const path = `farms/${farmId}/settings/model_params`;
      const docRef = doc(db, path);
      const docSnap = isOffline() ? await getDocFromCache(docRef) : await getDoc(docRef);
      return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
      if (isOffline() || isBenignFirestoreFailure(error)) return null;
      handleFirestoreError(error, OperationType.GET, `farms/${farmId}/settings/model_params`);
      return null;
    }
  }
};

// --- Farm Diary Data ---
export const diaryApi = {
  getEvents: async (farmId: string, startDate?: string, endDate?: string): Promise<DiaryEvent[]> => {
    const result = await diaryApi.getEventsPaginated(farmId, { startDate, endDate, limit: 500 });
    return result.items;
  },

  getEventsPaginated: async (
    farmId: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<DiaryEvent>> => {
    if (isLocalOnlyFarmSession()) {
      const { localDiaryEvents } = await import('../lib/localDiaryEvents');
      const items = localDiaryEvents.list(farmId, options.startDate, options.endDate);
      return { items, lastDoc: null, hasMore: false };
    }
    try {
      const pageSize = options.limit ?? DEFAULT_PAGE_SIZE;
      const path = collection(db, `farms/${farmId}/events`);

      const constraints: Parameters<typeof query>[1][] = [];
      if (options.startDate && options.endDate) {
        constraints.push(where('date', '>=', options.startDate));
        constraints.push(where('date', '<=', options.endDate));
      } else if (options.startDate) {
        constraints.push(where('date', '>=', options.startDate));
      }
      constraints.push(orderBy('date', 'desc'));
      if (options.startAfterDoc) {
        constraints.push(startAfter(options.startAfterDoc));
      }
      constraints.push(limit(pageSize));

      const q = query(path, ...constraints);
      const snapshot = isOffline() ? await getDocsFromCache(q) : await getDocs(q);
      const items = snapshot.docs.map((d) => d.data() as DiaryEvent);
      const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;

      return {
        items,
        lastDoc,
        hasMore: snapshot.docs.length === pageSize,
      };
    } catch (error) {
      if (isOffline() || isBenignFirestoreFailure(error)) {
        return { items: [], lastDoc: null, hasMore: false };
      }
      handleFirestoreError(error, OperationType.LIST, `farms/${farmId}/events`);
      return { items: [], lastDoc: null, hasMore: false };
    }
  },
  saveEvent: async (farmId: string, event: DiaryEvent): Promise<void> => {
    if (isLocalOnlyFarmSession()) {
      const { localDiaryEvents } = await import('../lib/localDiaryEvents');
      localDiaryEvents.upsert(farmId, event);
      return;
    }
    try {
      const path = `farms/${farmId}/events`;
      const dataToSave = { ...event };
      Object.keys(dataToSave).forEach(key => {
        if ((dataToSave as any)[key] === undefined) {
          delete (dataToSave as any)[key];
        }
      });
      await setDoc(doc(db, path, event.id), dataToSave);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `farms/${farmId}/events/${event.id}`);
    }
  },
  deleteEvent: async (farmId: string, id: string): Promise<void> => {
    if (isLocalOnlyFarmSession()) {
      const { localDiaryEvents } = await import('../lib/localDiaryEvents');
      localDiaryEvents.remove(farmId, id);
      return;
    }
    try {
      const path = `farms/${farmId}/events`;
      await deleteDoc(doc(db, path, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `farms/${farmId}/events/${id}`);
    }
  },
  
  getSettings: async (farmId: string): Promise<FarmSettings | null> => {
    if (isLocalOnlyFarmSession()) return null;
    try {
      const path = `farms/${farmId}/settings`;
      const docRef = doc(db, path, 'farm');
      const docSnap = isOffline() ? await getDocFromCache(docRef) : await getDoc(docRef);
      return docSnap.exists() ? (docSnap.data() as FarmSettings) : null;
    } catch (error) {
      if (isOffline() || isBenignFirestoreFailure(error)) return null;
      handleFirestoreError(error, OperationType.GET, `farms/${farmId}/settings/farm`);
      return null;
    }
  },
  saveSettings: async (farmId: string, settings: FarmSettings): Promise<void> => {
    if (isLocalOnlyFarmSession()) return;
    try {
      const path = `farms/${farmId}/settings`;
      const dataToSave = { ...settings };
      Object.keys(dataToSave).forEach(key => {
        if ((dataToSave as any)[key] === undefined) {
          delete (dataToSave as any)[key];
        }
      });
      await setDoc(doc(db, path, 'farm'), dataToSave);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `farms/${farmId}/settings/farm`);
    }
  }
};
