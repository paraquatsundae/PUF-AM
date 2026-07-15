import { OrchardBlock, InfrastructurePin, FarmTrack, MapViewport } from '../lib/mapStore';
import { DiaryEvent, FarmSettings } from '../lib/farmDiary';
import { db, auth } from '../firebase';
import { collection, doc, getDocs, getDoc, setDoc, deleteDoc, query, where, getDocsFromCache, getDocFromCache, orderBy, limit, startAfter, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { isLocalOnlyFarmSession } from '../lib/workshopMode';
import { localMapStore } from '../lib/localMapStore';

// Helper to check if offline
const isOffline = () => typeof navigator !== 'undefined' && !navigator.onLine;

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo?: any[];
  }
}

function isBenignFirestoreFailure(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string })?.code || '';
  return (
    code === 'permission-denied' ||
    code === 'unauthenticated' ||
    code === 'failed-precondition' ||
    msg.includes('permission') ||
    msg.includes('Missing or insufficient permissions') ||
    msg.includes('INTERNAL ASSERTION FAILED') ||
    msg.includes('the client is offline')
  );
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  if (isBenignFirestoreFailure(error)) {
    console.warn(`[Firestore] Soft failure (${operationType}) ${path}:`, error);
    return;
  }
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

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

function intersectsBounds(
  geojson: { type?: string; coordinates?: unknown },
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }
): boolean {
  if (!geojson?.coordinates) return true;

  const points: Array<[number, number]> = [];
  const collect = (coords: unknown): void => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      points.push([coords[1] as number, coords[0] as number]);
      return;
    }
    for (const c of coords) collect(c);
  };
  collect(geojson.coordinates);

  return points.some(
    ([lat, lng]) =>
      lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng
  );
}

// --- Map Data ---
export const mapApi = {
  /**
   * Returns blocks, or `null` if cloud could not be read (permissions/offline).
   * Callers must not treat `null` as “farm has zero blocks”.
   */
  getBlocks: async (
    farmId: string,
    bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number }
  ): Promise<OrchardBlock[] | null> => {
    if (isLocalOnlyFarmSession()) {
      let blocks = localMapStore.getBlocks(farmId);
      if (bounds) blocks = blocks.filter((b) => intersectsBounds(b.geojson, bounds));
      return blocks;
    }
    try {
      const path = `farms/${farmId}/blocks`;
      const q = collection(db, path);
      const snapshot = isOffline() ? await getDocsFromCache(q) : await getDocs(q);
      let blocks = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          geojson: typeof data.geojson === 'string' ? JSON.parse(data.geojson) : data.geojson
        } as OrchardBlock;
      });

      if (bounds) {
        blocks = blocks.filter((block) => intersectsBounds(block.geojson, bounds));
      }

      return blocks;
    } catch (error) {
      if (isOffline() || isBenignFirestoreFailure(error)) {
        console.warn('[mapApi.getBlocks] Cloud unavailable; returning null', error);
        return null;
      }
      handleFirestoreError(error, OperationType.LIST, `farms/${farmId}/blocks`);
      return null;
    }
  },
  saveBlock: async (farmId: string, block: OrchardBlock): Promise<void> => {
    if (isLocalOnlyFarmSession()) {
      localMapStore.saveBlock(farmId, block);
      return;
    }
    try {
      const path = `farms/${farmId}/blocks`;
      // Firestore doesn't support nested arrays, so we stringify geojson
      const dataToSave = {
        ...block,
        geojson: JSON.stringify(block.geojson),
        areaHa: typeof block.areaHa === 'number' && !isNaN(block.areaHa) ? block.areaHa : 0
      };
      // Remove undefined fields
      Object.keys(dataToSave).forEach(key => {
        if ((dataToSave as any)[key] === undefined) {
          delete (dataToSave as any)[key];
        }
      });
      await setDoc(doc(db, path, block.id), dataToSave);
    } catch (error) {
      // Always throw so local-first sync can queue the write
      if (isBenignFirestoreFailure(error)) {
        console.warn(`[mapApi.saveBlock] Cloud write failed (will queue):`, error);
        throw error;
      }
      handleFirestoreError(error, OperationType.WRITE, `farms/${farmId}/blocks/${block.id}`);
    }
  },
  deleteBlock: async (farmId: string, id: string): Promise<void> => {
    if (isLocalOnlyFarmSession()) {
      localMapStore.deleteBlock(farmId, id);
      return;
    }
    try {
      const path = `farms/${farmId}/blocks`;
      await deleteDoc(doc(db, path, id));
    } catch (error) {
      if (isBenignFirestoreFailure(error)) {
        console.warn(`[mapApi.deleteBlock] Cloud delete failed (will queue):`, error);
        throw error;
      }
      handleFirestoreError(error, OperationType.DELETE, `farms/${farmId}/blocks/${id}`);
    }
  },
  
  getPins: async (
    farmId: string,
    bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number }
  ): Promise<InfrastructurePin[] | null> => {
    if (isLocalOnlyFarmSession()) {
      let pins = localMapStore.getPins(farmId);
      if (bounds) {
        pins = pins.filter(
          (p) =>
            p.lat >= bounds.minLat &&
            p.lat <= bounds.maxLat &&
            p.lng >= bounds.minLng &&
            p.lng <= bounds.maxLng
        );
      }
      return pins;
    }
    try {
      const path = `farms/${farmId}/pins`;
      let q: any = collection(db, path);
      
      if (bounds) {
        q = query(q, where('lat', '>=', bounds.minLat), where('lat', '<=', bounds.maxLat));
      }
      
      const snapshot = isOffline() ? await getDocsFromCache(q) : await getDocs(q);
      let pins = snapshot.docs.map(doc => doc.data() as InfrastructurePin);
      
      if (bounds) {
        pins = pins.filter(p => p.lng >= bounds.minLng && p.lng <= bounds.maxLng);
      }
      
      return pins;
    } catch (error) {
      if (isOffline() || isBenignFirestoreFailure(error)) {
        console.warn('[mapApi.getPins] Cloud unavailable; returning null', error);
        return null;
      }
      handleFirestoreError(error, OperationType.LIST, `farms/${farmId}/pins`);
      return null;
    }
  },
  savePin: async (farmId: string, pin: InfrastructurePin): Promise<void> => {
    if (isLocalOnlyFarmSession()) {
      localMapStore.savePin(farmId, pin);
      return;
    }
    try {
      const path = `farms/${farmId}/pins`;
      const dataToSave = { 
        ...pin,
        lat: typeof pin.lat === 'number' && !isNaN(pin.lat) ? pin.lat : 0,
        lng: typeof pin.lng === 'number' && !isNaN(pin.lng) ? pin.lng : 0
      };
      Object.keys(dataToSave).forEach(key => {
        if ((dataToSave as any)[key] === undefined) {
          delete (dataToSave as any)[key];
        }
      });
      await setDoc(doc(db, path, pin.id), dataToSave);
    } catch (error) {
      if (isBenignFirestoreFailure(error)) {
        console.warn('[mapApi.savePin] Cloud write failed (will queue):', error);
        throw error;
      }
      handleFirestoreError(error, OperationType.WRITE, `farms/${farmId}/pins/${pin.id}`);
    }
  },
  deletePin: async (farmId: string, id: string): Promise<void> => {
    if (isLocalOnlyFarmSession()) {
      localMapStore.deletePin(farmId, id);
      return;
    }
    try {
      const path = `farms/${farmId}/pins`;
      await deleteDoc(doc(db, path, id));
    } catch (error) {
      if (isBenignFirestoreFailure(error)) {
        console.warn('[mapApi.deletePin] Cloud delete failed (will queue):', error);
        throw error;
      }
      handleFirestoreError(error, OperationType.DELETE, `farms/${farmId}/pins/${id}`);
    }
  },

  getTracks: async (
    farmId: string,
    bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number }
  ): Promise<FarmTrack[] | null> => {
    if (isLocalOnlyFarmSession()) {
      let tracks = localMapStore.getTracks(farmId);
      if (bounds) tracks = tracks.filter((t) => intersectsBounds(t.geojson, bounds));
      return tracks;
    }
    try {
      const path = `farms/${farmId}/tracks`;
      const q = collection(db, path);
      const snapshot = isOffline() ? await getDocsFromCache(q) : await getDocs(q);
      let tracks = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          geojson: typeof data.geojson === 'string' ? JSON.parse(data.geojson) : data.geojson
        } as FarmTrack;
      });

      if (bounds) {
        tracks = tracks.filter((track) => intersectsBounds(track.geojson, bounds));
      }

      return tracks;
    } catch (error) {
      if (isOffline() || isBenignFirestoreFailure(error)) {
        console.warn('[mapApi.getTracks] Cloud unavailable; returning null', error);
        return null;
      }
      handleFirestoreError(error, OperationType.LIST, `farms/${farmId}/tracks`);
      return null;
    }
  },
  saveTrack: async (farmId: string, track: FarmTrack): Promise<void> => {
    if (isLocalOnlyFarmSession()) {
      localMapStore.saveTrack(farmId, track);
      return;
    }
    try {
      const path = `farms/${farmId}/tracks`;
      const dataToSave = {
        ...track,
        geojson: JSON.stringify(track.geojson)
      };
      Object.keys(dataToSave).forEach(key => {
        if ((dataToSave as any)[key] === undefined) {
          delete (dataToSave as any)[key];
        }
      });
      await setDoc(doc(db, path, track.id), dataToSave);
    } catch (error) {
      if (isBenignFirestoreFailure(error)) {
        console.warn('[mapApi.saveTrack] Cloud write failed (will queue):', error);
        throw error;
      }
      handleFirestoreError(error, OperationType.WRITE, `farms/${farmId}/tracks/${track.id}`);
    }
  },
  deleteTrack: async (farmId: string, id: string): Promise<void> => {
    if (isLocalOnlyFarmSession()) {
      localMapStore.deleteTrack(farmId, id);
      return;
    }
    try {
      const path = `farms/${farmId}/tracks`;
      await deleteDoc(doc(db, path, id));
    } catch (error) {
      if (isBenignFirestoreFailure(error)) {
        console.warn('[mapApi.deleteTrack] Cloud delete failed (will queue):', error);
        throw error;
      }
      handleFirestoreError(error, OperationType.DELETE, `farms/${farmId}/tracks/${id}`);
    }
  },
  
  getViewport: async (farmId: string): Promise<MapViewport | null> => {
    if (isLocalOnlyFarmSession()) {
      return localMapStore.getViewport(farmId);
    }
    try {
      const path = `farms/${farmId}/viewport`;
      const docRef = doc(db, path, 'current');
      const docSnap = isOffline() ? await getDocFromCache(docRef) : await getDoc(docRef);
      return docSnap.exists() ? (docSnap.data() as MapViewport) : null;
    } catch (error) {
      if (isOffline() || isBenignFirestoreFailure(error)) return null;
      handleFirestoreError(error, OperationType.GET, `farms/${farmId}/viewport/current`);
      return null;
    }
  },
  saveViewport: async (farmId: string, viewport: MapViewport): Promise<void> => {
    if (isLocalOnlyFarmSession()) {
      localMapStore.saveViewport(farmId, viewport);
      return;
    }
    try {
      const path = `farms/${farmId}/viewport`;
      const dataToSave = { ...viewport };
      Object.keys(dataToSave).forEach(key => {
        if ((dataToSave as any)[key] === undefined) {
          delete (dataToSave as any)[key];
        }
      });
      await setDoc(doc(db, path, 'current'), dataToSave);
    } catch (error) {
      if (isBenignFirestoreFailure(error)) {
        console.warn('[mapApi.saveViewport] Cloud write failed (will queue):', error);
        throw error;
      }
      handleFirestoreError(error, OperationType.WRITE, `farms/${farmId}/viewport/current`);
    }
  },
  
  getFarm: async (farmId: string): Promise<any | null> => {
    if (isLocalOnlyFarmSession()) {
      return { id: farmId, name: 'Workshop Orchard' };
    }
    try {
      const docRef = doc(db, 'farms', farmId);
      const docSnap = isOffline() ? await getDocFromCache(docRef) : await getDoc(docRef);
      return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
      if (isOffline() || isBenignFirestoreFailure(error)) return null;
      handleFirestoreError(error, OperationType.GET, `farms/${farmId}`);
      return null;
    }
  },
  
  updateFarm: async (farmId: string, updates: any): Promise<void> => {
    if (isLocalOnlyFarmSession()) return;
    try {
      await setDoc(doc(db, 'farms', farmId), updates, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `farms/${farmId}`);
    }
  },

  getMembers: async (farmId: string): Promise<any[]> => {
    if (isLocalOnlyFarmSession()) return [];
    try {
      const q = query(collection(db, 'users_public'), where('farmId', '==', farmId));
      const snapshot = isOffline() ? await getDocsFromCache(q) : await getDocs(q);
      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      if (isOffline() || isBenignFirestoreFailure(error)) return [];
      handleFirestoreError(error, OperationType.LIST, `users_public (farmId: ${farmId})`);
      return [];
    }
  },

  createInvitation: async (email: string, farmId: string, role: string, invitedBy: string): Promise<void> => {
    if (isLocalOnlyFarmSession()) return;
    try {
      await setDoc(doc(db, 'invitations', email.toLowerCase()), {
        email: email.toLowerCase(),
        farmId,
        role,
        invitedBy,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `invitations/${email}`);
    }
  },

  getInvitation: async (email: string): Promise<any | null> => {
    if (isLocalOnlyFarmSession()) return null;
    try {
      const docSnap = await getDoc(doc(db, 'invitations', email.toLowerCase()));
      return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
      if (isBenignFirestoreFailure(error)) return null;
      handleFirestoreError(error, OperationType.GET, `invitations/${email}`);
      return null;
    }
  },

  deleteInvitation: async (email: string): Promise<void> => {
    if (isLocalOnlyFarmSession()) return;
    try {
      await deleteDoc(doc(db, 'invitations', email.toLowerCase()));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `invitations/${email}`);
    }
  },

  joinFarm: async (uid: string, farmId: string, role: string): Promise<void> => {
    try {
      await setDoc(doc(db, 'users', uid), { farmId, role }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
    }
  },

  removeMember: async (uid: string): Promise<void> => {
    try {
      // Revert user to their own private farm
      const originalFarmId = `farm_${uid}`;
      await Promise.all([
        setDoc(doc(db, 'users', uid), { farmId: originalFarmId, role: 'admin' }, { merge: true }),
        setDoc(doc(db, 'users_public', uid), { farmId: originalFarmId, role: 'admin' }, { merge: true })
      ]);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
    }
  },

  updateMemberRole: async (uid: string, role: 'admin' | 'farmer' | 'viewer'): Promise<void> => {
    try {
      await Promise.all([
        setDoc(doc(db, 'users', uid), { role }, { merge: true }),
        setDoc(doc(db, 'users_public', uid), { role }, { merge: true })
      ]);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
    }
  }
};

// --- Tasks & Field Ops ---
export const tasksApi = {
  getTasks: async (farmId: string): Promise<any[]> => {
    if (isLocalOnlyFarmSession()) return [];
    try {
      const path = `farms/${farmId}/tasks`;
      const q = collection(db, path);
      const snapshot = isOffline() ? await getDocsFromCache(q) : await getDocs(q);
      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      if (isOffline() || isBenignFirestoreFailure(error)) return [];
      handleFirestoreError(error, OperationType.LIST, `farms/${farmId}/tasks`);
      return [];
    }
  },
  saveTask: async (farmId: string, task: any): Promise<void> => {
    if (isLocalOnlyFarmSession()) return;
    try {
      const path = `farms/${farmId}/tasks`;
      const dataToSave = { ...task, updatedAt: new Date().toISOString() };
      Object.keys(dataToSave).forEach(key => {
        if ((dataToSave as any)[key] === undefined) {
          delete (dataToSave as any)[key];
        }
      });
      await setDoc(doc(db, path, task.id), dataToSave);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `farms/${farmId}/tasks/${task.id}`);
    }
  },
  deleteTask: async (farmId: string, id: string): Promise<void> => {
    if (isLocalOnlyFarmSession()) return;
    try {
      const path = `farms/${farmId}/tasks`;
      await deleteDoc(doc(db, path, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `farms/${farmId}/tasks/${id}`);
    }
  }
};

// --- Safety Checklist ---
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

// --- Notifications ---
export const notificationApi = {
  getNotifications: async (userId: string): Promise<any[]> => {
    if (isLocalOnlyFarmSession()) return [];
    try {
      const path = `users/${userId}/notifications`;
      const q = collection(db, path);
      const snapshot = isOffline() ? await getDocsFromCache(q) : await getDocs(q);
      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      if (isOffline() || isBenignFirestoreFailure(error)) return [];
      handleFirestoreError(error, OperationType.LIST, `users/${userId}/notifications`);
      return [];
    }
  },
  createNotification: async (userId: string, notification: any): Promise<void> => {
    if (isLocalOnlyFarmSession()) return;
    let id = notification.id || uuidv4();
    try {
      const path = `users/${userId}/notifications`;
      const dataToSave = { 
        ...notification, 
        id, 
        userId, // Ensure userId is included in the data for validation
        createdAt: new Date().toISOString(), 
        read: false 
      };
      await setDoc(doc(db, path, id), dataToSave);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${userId}/notifications/${id}`);
    }
  },
  markAsRead: async (userId: string, notificationId: string): Promise<void> => {
    if (isLocalOnlyFarmSession()) return;
    try {
      const path = `users/${userId}/notifications`;
      await setDoc(doc(db, path, notificationId), { read: true }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${userId}/notifications/${notificationId}`);
    }
  }
};

// --- Blight Data ---
export const blightApi = {
  getBlightRisk: async (farmId: string): Promise<{ riskScore: number }> => {
    if (isLocalOnlyFarmSession()) return { riskScore: 0.1 };
    try {
      const path = `farms/${farmId}/settings/model_params`;
      const docSnap = await getDoc(doc(db, path));
      // This is a simplified risk score for the dashboard
      return { riskScore: docSnap.exists() ? 0.15 : 0.1 };
    } catch (error) {
      if (isBenignFirestoreFailure(error)) return { riskScore: 0.1 };
      handleFirestoreError(error, OperationType.GET, `farms/${farmId}/settings/model_params`);
      return { riskScore: 0.1 };
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
