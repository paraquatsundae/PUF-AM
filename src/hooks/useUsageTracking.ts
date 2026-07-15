import { create } from 'zustand';
import { doc, getDoc, setDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { useEffect } from 'react';

export const LIMITS = {
  free: { calculations: 50 },
  premium: { calculations: 500 }
};

interface UsageState {
  usage: { calculations: number };
  loading: boolean;
  isLoaded: boolean;
  currentFarmId: string | null;
  currentDate: string | null;
  setUsage: (usage: { calculations: number }) => void;
  loadUsage: (farmId: string, today: string) => Promise<void>;
  recordUsage: (farmId: string, today: string, type: 'calculations') => Promise<void>;
}

const useUsageStore = create<UsageState>((set, get) => ({
  usage: { calculations: 0 },
  loading: true,
  isLoaded: false,
  currentFarmId: null,
  currentDate: null,

  setUsage: (usage) => set({ usage }),

  loadUsage: async (farmId, today) => {
    if (get().isLoaded && !get().loading && get().currentFarmId === farmId && get().currentDate === today) return;
    
    set({ loading: true, currentFarmId: farmId, currentDate: today });
    try {
      const usageRef = doc(db, 'farms', farmId, 'usage', today);
      const usageSnap = await getDoc(usageRef);

      if (usageSnap.exists()) {
        set({
          usage: {
            calculations: usageSnap.data().calculations || 0
          },
          isLoaded: true,
          loading: false
        });
      } else {
        await setDoc(usageRef, {
          date: today,
          calculations: 0
        });
        set({ usage: { calculations: 0 }, isLoaded: true, loading: false });
      }
    } catch (err) {
      console.error('Failed to load usage data:', err);
      set({ loading: false });
    }
  },

  recordUsage: async (farmId, today, type) => {
    const usageRef = doc(db, 'farms', farmId, 'usage', today);
    try {
      await setDoc(usageRef, {
        [type]: increment(1),
        date: today
      }, { merge: true });
      
      set(state => ({
        usage: {
          ...state.usage,
          [type]: state.usage[type] + 1
        }
      }));
    } catch (error) {
      console.error("Failed to record usage:", error);
    }
  }
}));

export function useUsageTracking() {
  const { userData } = useAuth();
  const store = useUsageStore();
  const today = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    if (userData?.farmId) {
      store.loadUsage(userData.farmId, today);
    }
  }, [userData?.farmId, today]);

  const checkLimit = (type: 'calculations'): boolean => {
    if (!userData) return false;
    const tier = userData.subscriptionTier || 'free';
    const limit = LIMITS[tier][type];
    return store.usage[type] < limit;
  };

  const recordUsage = async (type: 'calculations') => {
    if (userData?.farmId) {
      await store.recordUsage(userData.farmId, today, type);
    }
  };

  return {
    usage: store.usage,
    loading: store.loading,
    checkLimit,
    recordUsage,
    tier: userData?.subscriptionTier || 'free',
    limits: LIMITS[userData?.subscriptionTier || 'free']
  };
}
