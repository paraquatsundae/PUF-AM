import { create } from 'zustand';
import { db } from '../firebase';
import { collection, query, doc, setDoc, deleteDoc, updateDoc, getDoc, writeBatch, where, getDocs, getDocsFromCache } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../contexts/AuthContext';
import { isLocalOnlyFarmSession } from './workshopMode';
import { localFieldIssues } from './localFieldIssues';

function isPermissionOrOfflineError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string })?.code || '';
  return (
    code === 'permission-denied' ||
    code === 'unauthenticated' ||
    code === 'unavailable' ||
    msg.includes('Missing or insufficient permissions') ||
    msg.includes('the client is offline')
  );
}

/** Firestore rejects `undefined` field values. */
function issueForFirestore(issue: FieldIssue): Record<string, unknown> {
  const data: Record<string, unknown> = { ...issue };
  for (const key of Object.keys(data)) {
    if (data[key] === undefined) delete data[key];
  }
  return data;
}

export interface FieldIssue {
  id: string;
  lat: number;
  lng: number;
  category: 'irrigation' | 'pest' | 'disease' | 'damage' | 'other';
  priority: 'low' | 'medium' | 'high';
  note?: string;
  photoData?: string;
  photoUrl?: string;
  status: 'open' | 'in-progress' | 'resolved' | 'archived';
  isMistake?: boolean;
  reportedBy: string;
  reportedAt: string;
  resolvedAt?: string;
  archivedAt?: string;
  archivedBy?: string;
  /** LWW / outbox stamp */
  updatedAt?: string;
}

export interface PathTrace {
  id: string;
  recordedBy: string;
  startTime: string;
  endTime?: string;
  coordinates: { lat: number; lng: number; timestamp: number }[];
}

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

interface FieldState {
  issues: FieldIssue[];
  archivedIssues: FieldIssue[];
  pathTraces: PathTrace[];
  isLoaded: boolean;
  isArchiveLoaded: boolean;
  currentFarmId: string | null;
  bounds: Bounds | null;
  loadData: (farmId: string) => void;
  loadArchive: (farmId: string) => void;
  setBounds: (bounds: Bounds | null) => void;
  addIssue: (farmId: string, issue: FieldIssue) => Promise<void>;
  updateIssue: (farmId: string, id: string, updates: Partial<FieldIssue>) => Promise<void>;
  archiveIssue: (farmId: string, id: string, archivedBy: string) => Promise<void>;
  deleteIssue: (farmId: string, id: string) => Promise<void>;
  addPathTrace: (farmId: string, trace: PathTrace) => Promise<void>;
}

let unsubscribeIssues: (() => void) | null = null;
let unsubscribeArchive: (() => void) | null = null;
let unsubscribePaths: (() => void) | null = null;

export const useFieldStore = create<FieldState>((set, get) => ({
  issues: [],
  archivedIssues: [],
  pathTraces: [],
  isLoaded: false,
  isArchiveLoaded: false,
  currentFarmId: null,
  bounds: null,

  setBounds: (bounds) => {
    const currentFarmId = get().currentFarmId;
    set({ bounds });
    if (currentFarmId) {
      // Re-trigger loadData with new bounds
      get().loadData(currentFarmId);
    }
  },

  loadData: (farmId: string) => {
    const { bounds, currentFarmId } = get();
    const isNewFarm = currentFarmId !== farmId;
    
    if (unsubscribeIssues) unsubscribeIssues();
    if (unsubscribePaths) unsubscribePaths();

    if (isNewFarm) {
      set({ currentFarmId: farmId, isLoaded: false });
    } else {
      set({ currentFarmId: farmId });
    }

    if (isLocalOnlyFarmSession()) {
      set({
        issues: localFieldIssues.getOpen(farmId),
        pathTraces: [],
        isLoaded: true,
      });
      return;
    }

    let issuesQuery: any = collection(db, `farms/${farmId}/issues`);
    
    if (bounds) {
      // Use simple lat/lng bounds if provided. 
      // Note: This requires composite indexes in Firestore for multiple inequality filters.
      issuesQuery = query(
        issuesQuery,
        where('lat', '>=', bounds.minLat),
        where('lat', '<=', bounds.maxLat)
      );
      // We'll filter lng client-side for now to avoid complex index requirements 
      // unless we are sure about the index. Firestore multiple inequality on different fields 
      // is supported but requires specific index.
    }

    // Phase 3.2: Replace onSnapshot with polling for viewport-based querying to prevent excessive reads
    const fetchIssues = async () => {
      try {
        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
        const snapshot = isOffline ? await getDocsFromCache(issuesQuery) : await getDocs(issuesQuery);
        let issues = snapshot.docs.map(doc => doc.data() as FieldIssue);
        
        // Client-side lng filtering if bounds exist
        if (bounds) {
          issues = issues.filter(i => i.lng >= bounds.minLng && i.lng <= bounds.maxLng);
        }

        // Merge any locally-held issues that cloud doesn't have yet (offline / permission fallback)
        const local = localFieldIssues.getOpen(farmId);
        const byId = new Map(issues.map((i) => [i.id, i]));
        for (const li of local) {
          if (!byId.has(li.id)) byId.set(li.id, li);
        }
        const merged = Array.from(byId.values());
        localFieldIssues.saveOpen(farmId, merged);
        set({ issues: merged, isLoaded: true });
      } catch (error) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          set({ issues: localFieldIssues.getOpen(farmId), isLoaded: true });
          return;
        }
        handleFirestoreError(error, OperationType.GET, `farms/${farmId}/issues`);
        // Keep workshop / denied projects usable from local storage
        set({ issues: localFieldIssues.getOpen(farmId), isLoaded: true });
      }
    };

    const fetchPaths = async () => {
      try {
        const pathsRef = collection(db, `farms/${farmId}/pathTraces`);
        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
        const snapshot = isOffline ? await getDocsFromCache(pathsRef) : await getDocs(pathsRef);
        const pathTraces = snapshot.docs.map(doc => doc.data() as PathTrace);
        set({ pathTraces, isLoaded: true });
      } catch (error) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
           return;
        }
        handleFirestoreError(error, OperationType.GET, `farms/${farmId}/pathTraces`);
      }
    };

    fetchIssues();
    fetchPaths();

    // Poll every 30 seconds
    const intervalId = setInterval(() => {
      fetchIssues();
      fetchPaths();
    }, 30000);

    unsubscribeIssues = () => clearInterval(intervalId);
    unsubscribePaths = () => {}; // Handled by the same interval
  },

  loadArchive: (farmId: string) => {
    if (get().isArchiveLoaded && get().currentFarmId === farmId) return;

    if (unsubscribeArchive) unsubscribeArchive();

    set({ isArchiveLoaded: false });

    if (isLocalOnlyFarmSession()) {
      set({
        archivedIssues: localFieldIssues.getArchived(farmId),
        isArchiveLoaded: true,
      });
      return;
    }

    const archiveRef = collection(db, `farms/${farmId}/archived_issues`);
    const fetchArchive = async () => {
      try {
        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
        const snapshot = isOffline
          ? await getDocsFromCache(archiveRef)
          : await getDocs(archiveRef);
        const archivedIssues = snapshot.docs.map((d) => d.data() as FieldIssue);
        const local = localFieldIssues.getArchived(farmId);
        const byId = new Map(archivedIssues.map((i) => [i.id, i]));
        for (const li of local) {
          if (!byId.has(li.id)) byId.set(li.id, li);
        }
        const merged = Array.from(byId.values());
        localFieldIssues.saveArchived(farmId, merged);
        set({ archivedIssues: merged, isArchiveLoaded: true });
      } catch (error) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          set({ archivedIssues: localFieldIssues.getArchived(farmId), isArchiveLoaded: true });
          return;
        }
        handleFirestoreError(error, OperationType.GET, `farms/${farmId}/archived_issues`);
        set({ archivedIssues: localFieldIssues.getArchived(farmId), isArchiveLoaded: true });
      }
    };
    void fetchArchive();
    const intervalId = setInterval(() => void fetchArchive(), 60000);
    unsubscribeArchive = () => clearInterval(intervalId);
  },

  addIssue: async (farmId, issue) => {
    // Always persist locally first so the pin sticks even if cloud rules reject.
    const stamped = {
      ...issue,
      updatedAt: (issue as { updatedAt?: string }).updatedAt || new Date().toISOString(),
    } as FieldIssue;
    const issues = localFieldIssues.upsertOpen(farmId, stamped);
    set({ issues });

    const { upsertLocalEntity } = await import('./localFarmRepo');
    const kind = stamped.status === 'archived' ? 'issues_archive' : 'issues';
    await upsertLocalEntity(farmId, kind, stamped, { queueCloud: true });

    const { scheduleMistHotAutoPublish } = await import('../mist/mistHotBridge');
    scheduleMistHotAutoPublish(farmId);

    if (isLocalOnlyFarmSession()) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    const collectionName = stamped.status === 'archived' ? 'archived_issues' : 'issues';
    try {
      await setDoc(doc(db, `farms/${farmId}/${collectionName}`, stamped.id), issueForFirestore(stamped));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `farms/${farmId}/${collectionName}`);
      if (isPermissionOrOfflineError(error)) {
        console.warn('[fieldStore.addIssue] Cloud write blocked; kept local/outbox copy');
        return;
      }
      throw error;
    }
  },

  updateIssue: async (farmId, id, updates) => {
    const withStamp = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    const next = localFieldIssues.updateOpen(
      farmId,
      id,
      withStamp as Partial<FieldIssue> & Record<string, unknown>
    );
    set({ issues: next });
    const updated = next.find((i) => i.id === id);
    if (updated) {
      const { upsertLocalEntity } = await import('./localFarmRepo');
      await upsertLocalEntity(farmId, 'issues', updated, { queueCloud: true });
      const { scheduleMistHotAutoPublish } = await import('../mist/mistHotBridge');
      scheduleMistHotAutoPublish(farmId);
    }

    if (isLocalOnlyFarmSession()) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    try {
      const clean: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(withStamp)) {
        if (value !== undefined) clean[key] = value;
      }
      await updateDoc(doc(db, `farms/${farmId}/issues`, id), clean);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `farms/${farmId}/issues`);
      if (isPermissionOrOfflineError(error)) {
        console.warn('[fieldStore.updateIssue] Cloud update blocked; kept local/outbox copy');
        return;
      }
      throw error;
    }
  },

  archiveIssue: async (farmId, id, archivedBy) => {
    if (isLocalOnlyFarmSession()) {
      const { open, archived } = localFieldIssues.archive(farmId, id, archivedBy);
      set({ issues: open, archivedIssues: archived });
      return;
    }
    try {
      const issueRef = doc(db, `farms/${farmId}/issues`, id);
      const archiveRef = doc(db, `farms/${farmId}/archived_issues`, id);
      
      const issueSnap = await getDoc(issueRef);
      if (!issueSnap.exists()) return;
      
      const issueData = issueSnap.data() as FieldIssue;
      const archivedData: FieldIssue = {
        ...issueData,
        status: 'archived',
        archivedAt: new Date().toISOString(),
        archivedBy
      };

      const batch = writeBatch(db);
      batch.set(archiveRef, archivedData);
      batch.delete(issueRef);
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `farms/${farmId}/issues`);
      throw error;
    }
  },

  deleteIssue: async (farmId, id) => {
    if (isLocalOnlyFarmSession()) {
      const { open, archived } = localFieldIssues.delete(farmId, id);
      set({ issues: open, archivedIssues: archived });
      return;
    }
    try {
      // Try deleting from both just in case, or we could check status
      const issueRef = doc(db, `farms/${farmId}/issues`, id);
      const archiveRef = doc(db, `farms/${farmId}/archived_issues`, id);
      
      const batch = writeBatch(db);
      batch.delete(issueRef);
      batch.delete(archiveRef);
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `farms/${farmId}/issues`);
      throw error;
    }
  },

  addPathTrace: async (farmId, trace) => {
    try {
      await setDoc(doc(db, `farms/${farmId}/pathTraces`, trace.id), trace);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `farms/${farmId}/pathTraces`);
      throw error;
    }
  }
}));
