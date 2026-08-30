import type { OrchardBlock, InfrastructurePin, FarmTrack, MapViewport } from '../lib/mapStore';
import { db } from '../firebase';
import { collection, doc, getDocs, getDoc, getDocFromCache, setDoc, deleteDoc, query, where, getDocsFromCache } from 'firebase/firestore';
import { isLocalOnlyFarmSession } from '../lib/workshopMode';
import { localMapStore } from '../lib/localMapStore';
import { handleFirestoreError, isBenignFirestoreFailure, OperationType } from '../lib/firestoreErrors';
import { isOffline } from './firestoreOffline';

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
      // Project to Firestore-allowlisted fields only (rules reject unknown keys).
      // GeoJSON is stringified — Firestore cannot store nested arrays.
      const dataToSave: Record<string, unknown> = {
        id: block.id,
        name: block.name || '',
        cultivar: block.cultivar || '',
        density: block.density || '',
        irrigation: block.irrigation || '',
        areaHa: typeof block.areaHa === 'number' && !isNaN(block.areaHa) ? block.areaHa : 0,
        geojson: JSON.stringify(block.geojson),
      };
      const optionalNums: (keyof OrchardBlock)[] = [
        'rowSpacing',
        'treeSpacing',
        'treeHeight',
        'canopyWidth',
        'canopyClosure',
      ];
      for (const key of optionalNums) {
        const v = block[key];
        if (typeof v === 'number' && !isNaN(v)) dataToSave[key] = v;
      }
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
      let pins = snapshot.docs.map((d) => {
        const raw = d.data() as InfrastructurePin & { geojson?: unknown };
        let geojson = raw.geojson;
        if (typeof geojson === 'string' && geojson.trim()) {
          try {
            geojson = JSON.parse(geojson);
          } catch {
            geojson = undefined;
          }
        }
        return { ...raw, geojson } as InfrastructurePin;
      });
      
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
      // Allowlist (firestore.rules isValidInfrastructurePin). GeoJSON stringified.
      const dataToSave: Record<string, unknown> = {
        id: pin.id,
        name: pin.name || '',
        type: pin.type || '',
        status: pin.status || 'active',
        lat: typeof pin.lat === 'number' && !isNaN(pin.lat) ? pin.lat : 0,
        lng: typeof pin.lng === 'number' && !isNaN(pin.lng) ? pin.lng : 0,
      };
      if (pin.geojson != null) {
        dataToSave.geojson =
          typeof pin.geojson === 'string' ? pin.geojson : JSON.stringify(pin.geojson);
      }
      if (pin.trackerId) dataToSave.trackerId = String(pin.trackerId).slice(0, 119);
      if (pin.notes) dataToSave.notes = String(pin.notes).slice(0, 1999);
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
      const dataToSave: Record<string, unknown> = {
        id: track.id,
        name: track.name || '',
        category: track.category,
        geojson: JSON.stringify(track.geojson),
      };
      if (track.createdAt) dataToSave.createdAt = track.createdAt;
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

