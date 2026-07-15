import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  showDashboardIntro: boolean;
  dismissDashboardIntro: () => void;
  resetDashboardIntro: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      showDashboardIntro: true,
      dismissDashboardIntro: () => set({ showDashboardIntro: false }),
      resetDashboardIntro: () => set({ showDashboardIntro: true }),
    }),
    {
      name: 'app-preferences',
    }
  )
);
