import { create } from 'zustand';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, getDocs, getDocsFromCache } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../contexts/AuthContext';
import { isLocalOnlyFarmSession } from './workshopMode';

export interface Task {
  id: string;
  title: string;
  description?: string;
  assignedTo?: string;
  assignedToName?: string;
  assignedTrackId?: string;
  targetBlockId?: string;
  issueIds?: string[];
  status: 'pending' | 'accepted' | 'in-progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
  tools?: string[];
  notes?: string;
  safetyChecklistAccepted?: boolean;
  acceptedAt?: string;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
}

export interface UserLocation {
  uid: string;
  lat: number;
  lng: number;
  timestamp: number;
  activeTaskId?: string;
}

interface TaskState {
  tasks: Task[];
  activeLocations: Record<string, UserLocation>;
  isLoaded: boolean;
  currentFarmId: string | null;
  loadTasks: (farmId: string) => void;
  addTask: (farmId: string, task: Task) => Promise<void>;
  updateTask: (farmId: string, id: string, updates: Partial<Task>) => Promise<void>;
  updateTaskStatus: (farmId: string, id: string, status: Task['status']) => Promise<void>;
  deleteTask: (farmId: string, id: string) => Promise<void>;
  updateUserLocation: (farmId: string, uid: string, location: Partial<UserLocation>) => Promise<void>;
}

let unsubscribeTasks: (() => void) | null = null;
let unsubscribeLocations: (() => void) | null = null;

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  activeLocations: {},
  isLoaded: false,
  currentFarmId: null,

  loadTasks: (farmId: string) => {
    if (get().isLoaded && get().currentFarmId === farmId) return;

    if (unsubscribeTasks) unsubscribeTasks();
    if (unsubscribeLocations) {
      clearInterval(unsubscribeLocations as any);
    }

    set({ currentFarmId: farmId, isLoaded: false });

    if (isLocalOnlyFarmSession()) {
      set({ tasks: [], activeLocations: {}, isLoaded: true });
      return;
    }

    const tasksRef = collection(db, `farms/${farmId}/tasks`);
    unsubscribeTasks = onSnapshot(tasksRef, (snapshot) => {
      const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
      set({ tasks });
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `farms/${farmId}/tasks`);
    });

    // Phase 3.1: Replace onSnapshot with polling for active_locations to prevent O(N^2) reads at scale
    const fetchLocations = async () => {
      try {
        const locationsRef = collection(db, `farms/${farmId}/active_locations`);
        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
        const snapshot = isOffline ? await getDocsFromCache(locationsRef) : await getDocs(locationsRef);
        const locations: Record<string, UserLocation> = {};
        const now = Date.now();
        
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          // Only keep locations updated in the last 15 minutes (900000 ms)
          if (now - (data.timestamp || 0) < 900000) {
            locations[doc.id] = { uid: doc.id, ...data } as UserLocation;
          }
        });
        set({ activeLocations: locations, isLoaded: true });
      } catch (error) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
           return;
        }
        console.error("Error fetching locations:", error);
      }
    };

    // Fetch immediately, then poll every 60 seconds
    fetchLocations();
    const intervalId = setInterval(fetchLocations, 60000);
    unsubscribeLocations = intervalId as any;
  },

  addTask: async (farmId, task) => {
    try {
      await setDoc(doc(db, `farms/${farmId}/tasks`, task.id), task);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `farms/${farmId}/tasks`);
      throw error;
    }
  },

  updateTask: async (farmId, id, updates) => {
    try {
      await updateDoc(doc(db, `farms/${farmId}/tasks`, id), {
        ...updates,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `farms/${farmId}/tasks`);
      throw error;
    }
  },

  updateTaskStatus: async (farmId, id, status) => {
    try {
      const updates: Partial<Task> = { status };
      if (status === 'completed') {
        updates.completedAt = new Date().toISOString();
      }
      await updateDoc(doc(db, `farms/${farmId}/tasks`, id), {
        ...updates,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `farms/${farmId}/tasks`);
      throw error;
    }
  },

  deleteTask: async (farmId, id) => {
    try {
      await deleteDoc(doc(db, `farms/${farmId}/tasks`, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `farms/${farmId}/tasks`);
      throw error;
    }
  },

  updateUserLocation: async (farmId, uid, location) => {
    try {
      await setDoc(doc(db, `farms/${farmId}/active_locations`, uid), {
        ...location,
        uid,
        timestamp: Date.now()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `farms/${farmId}/active_locations`);
      throw error;
    }
  }
}));
