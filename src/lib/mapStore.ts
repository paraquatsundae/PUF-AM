import { create } from 'zustand';
import { useAuth } from '../contexts/AuthContext';
import { useEffect, useCallback } from 'react';
import {
  flushPendingGeometry,
  loadFarmGeometryLocalFirst,
  pendingGeometryCount,
  persistBlock,
  persistPin,
  persistTrack,
  persistViewport,
  removeBlockPersisted,
  removePinPersisted,
  removeTrackPersisted,
} from './farmGeometrySync';

export interface OrchardBlock {
  id: string;
  name: string;
  cultivar: string;
  density: string;
  rowSpacing?: number;
  treeSpacing?: number;
  treeHeight?: number;
  canopyWidth?: number;
  canopyClosure?: number;
  irrigation: string;
  areaHa?: number;
  geojson: any;
}

export interface InfrastructurePin {
  id: string;
  name: string;
  type: 'weather' | 'soil' | 'irrigation' | '';
  status: 'active' | 'warning' | 'offline';
  lat: number;
  lng: number;
}

export interface FarmTrack {
  id: string;
  name: string;
  category: 'primary' | 'secondary' | 'service';
  geojson: any;
  createdAt: string;
}

export interface MapViewport {
  lat: number;
  lng: number;
  zoom: number;
}

const DEFAULT_VIEWPORT: MapViewport = { lat: -33.9249, lng: 115.0750, zoom: 15 };

/** Ignore stale async load results when a newer load/save superseded them. */
let loadGeneration = 0;

interface MapState {
  blocks: OrchardBlock[];
  pins: InfrastructurePin[];
  tracks: FarmTrack[];
  viewport: MapViewport;
  isLoaded: boolean;
  isLoading: boolean;
  isLocked: boolean;
  error: string | null;
  currentFarmId: string | null;
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
  pendingSyncCount: number;
  setViewport: (viewport: MapViewport) => void;
  setLocked: (isLocked: boolean) => void;
  setBounds: (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null) => void;
  addBlock: (farmId: string, canEdit: boolean, block: OrchardBlock) => Promise<void>;
  updateBlock: (farmId: string, canEdit: boolean, id: string, updates: Partial<OrchardBlock>) => Promise<void>;
  removeBlock: (farmId: string, canEdit: boolean, id: string) => Promise<void>;
  addPin: (farmId: string, canEdit: boolean, pin: InfrastructurePin) => Promise<void>;
  updatePin: (farmId: string, canEdit: boolean, id: string, updates: Partial<InfrastructurePin>) => Promise<void>;
  removePin: (farmId: string, canEdit: boolean, id: string) => Promise<void>;
  addTrack: (farmId: string, canEdit: boolean, track: FarmTrack) => Promise<void>;
  updateTrack: (farmId: string, canEdit: boolean, id: string, updates: Partial<FarmTrack>) => Promise<void>;
  removeTrack: (farmId: string, canEdit: boolean, id: string) => Promise<void>;
  loadData: (farmId: string) => Promise<void>;
  refreshPendingCount: (farmId: string) => Promise<void>;
  flushSync: (farmId: string) => Promise<void>;
}

function filterByBounds<T extends { lat?: number; lng?: number; geojson?: any }>(
  items: T[],
  bounds: MapState['bounds'],
  kind: 'point' | 'geo'
): T[] {
  if (!bounds) return items;
  if (kind === 'point') {
    return items.filter(
      (p) =>
        typeof p.lat === 'number' &&
        typeof p.lng === 'number' &&
        p.lat >= bounds.minLat &&
        p.lat <= bounds.maxLat &&
        p.lng >= bounds.minLng &&
        p.lng <= bounds.maxLng
    );
  }
  // Client already has full geometry offline; bounds filter is optional for list views.
  return items;
}

const useMapStoreInternal = create<MapState>((set, get) => ({
  blocks: [],
  pins: [],
  tracks: [],
  viewport: DEFAULT_VIEWPORT,
  isLoaded: false,
  isLoading: true,
  isLocked: true,
  error: null,
  currentFarmId: null,
  bounds: null,
  pendingSyncCount: 0,

  setViewport: (viewport) => set({ viewport }),
  setLocked: (isLocked) => set({ isLocked }),

  setBounds: (bounds) => {
    set({ bounds });
  },

  refreshPendingCount: async (farmId: string) => {
    try {
      const count = await pendingGeometryCount(farmId);
      set({ pendingSyncCount: count });
    } catch {
      /* ignore */
    }
  },

  flushSync: async (farmId: string) => {
    await flushPendingGeometry(farmId);
    await get().refreshPendingCount(farmId);
  },

  loadData: async (farmId: string) => {
    const { bounds } = get();
    const gen = ++loadGeneration;
    set({ isLoading: true, error: null, currentFarmId: farmId });
    try {
      // Flush queued cloud writes before hydrate so remote isn't stale empty
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        await flushPendingGeometry(farmId);
      }

      const bundle = await loadFarmGeometryLocalFirst(farmId);
      if (gen !== loadGeneration || get().currentFarmId !== farmId) return;

      let blocks = bundle.blocks || [];
      let pins = bundle.pins || [];
      let tracks = bundle.tracks || [];

      if (bounds) {
        pins = filterByBounds(pins, bounds, 'point');
      }

      set({
        blocks,
        pins,
        tracks,
        viewport: bundle.viewport || DEFAULT_VIEWPORT,
        isLoaded: true,
        isLoading: false,
      });
      await get().refreshPendingCount(farmId);
    } catch (err) {
      if (gen !== loadGeneration) return;
      console.error('Failed to load map data:', err);
      set({ error: 'Failed to load map data', isLoading: false });
    }
  },

  addBlock: async (farmId, canEdit, block) => {
    if (!farmId || !canEdit) return;
    // Bump generation so an in-flight hydrate cannot overwrite this draw
    loadGeneration += 1;
    set((state) => ({ blocks: [...state.blocks, block] }));
    try {
      await persistBlock(farmId, block);
      await get().refreshPendingCount(farmId);
    } catch (err) {
      console.error('Failed to save block:', err);
    }
  },

  updateBlock: async (farmId, canEdit, id, updates) => {
    if (!farmId || !canEdit) return;
    loadGeneration += 1;
    const state = get();
    const newBlocks = state.blocks.map((b) => (b.id === id ? { ...b, ...updates } : b));
    const updatedBlock = newBlocks.find((b) => b.id === id);
    set({ blocks: newBlocks });
    if (updatedBlock) {
      try {
        await persistBlock(farmId, updatedBlock);
        await get().refreshPendingCount(farmId);
      } catch (err) {
        console.error('Failed to save block:', err);
      }
    }
  },

  removeBlock: async (farmId, canEdit, id) => {
    if (!farmId || !canEdit) return;
    loadGeneration += 1;
    set((state) => ({ blocks: state.blocks.filter((b) => b.id !== id) }));
    try {
      await removeBlockPersisted(farmId, id);
      await get().refreshPendingCount(farmId);
    } catch (err) {
      console.error('Failed to delete block:', err);
    }
  },

  addPin: async (farmId, canEdit, pin) => {
    if (!farmId || !canEdit) return;
    loadGeneration += 1;
    set((state) => ({ pins: [...state.pins, pin] }));
    try {
      await persistPin(farmId, pin);
      await get().refreshPendingCount(farmId);
    } catch (err) {
      console.error('Failed to save pin:', err);
    }
  },

  updatePin: async (farmId, canEdit, id, updates) => {
    if (!farmId || !canEdit) return;
    loadGeneration += 1;
    const state = get();
    const newPins = state.pins.map((p) => (p.id === id ? { ...p, ...updates } : p));
    const updatedPin = newPins.find((p) => p.id === id);
    set({ pins: newPins });
    if (updatedPin) {
      try {
        await persistPin(farmId, updatedPin);
        await get().refreshPendingCount(farmId);
      } catch (err) {
        console.error('Failed to save pin:', err);
      }
    }
  },

  removePin: async (farmId, canEdit, id) => {
    if (!farmId || !canEdit) return;
    loadGeneration += 1;
    set((state) => ({ pins: state.pins.filter((p) => p.id !== id) }));
    try {
      await removePinPersisted(farmId, id);
      await get().refreshPendingCount(farmId);
    } catch (err) {
      console.error('Failed to delete pin:', err);
    }
  },

  addTrack: async (farmId, canEdit, track) => {
    if (!farmId || !canEdit) return;
    loadGeneration += 1;
    set((state) => ({ tracks: [...state.tracks, track] }));
    try {
      await persistTrack(farmId, track);
      await get().refreshPendingCount(farmId);
    } catch (err) {
      console.error('Failed to save track:', err);
    }
  },

  updateTrack: async (farmId, canEdit, id, updates) => {
    if (!farmId || !canEdit) return;
    loadGeneration += 1;
    const state = get();
    const newTracks = state.tracks.map((t) => (t.id === id ? { ...t, ...updates } : t));
    const updatedTrack = newTracks.find((t) => t.id === id);
    set({ tracks: newTracks });
    if (updatedTrack) {
      try {
        await persistTrack(farmId, updatedTrack);
        await get().refreshPendingCount(farmId);
      } catch (err) {
        console.error('Failed to save track:', err);
      }
    }
  },

  removeTrack: async (farmId, canEdit, id) => {
    if (!farmId || !canEdit) return;
    loadGeneration += 1;
    set((state) => ({ tracks: state.tracks.filter((t) => t.id !== id) }));
    try {
      await removeTrackPersisted(farmId, id);
      await get().refreshPendingCount(farmId);
    } catch (err) {
      console.error('Failed to delete track:', err);
    }
  },
}));

export function useMapStore() {
  const { userData } = useAuth();
  const farmId = userData?.farmId;
  const canEdit = userData?.role === 'admin' || userData?.role === 'farmer';

  const store = useMapStoreInternal();

  useEffect(() => {
    if (farmId) {
      store.loadData(farmId);
    }
  }, [farmId]);

  useEffect(() => {
    if (store.isLoaded && farmId) {
      persistViewport(farmId, store.viewport).catch((err) =>
        console.error('Failed to save viewport:', err)
      );
    }
  }, [store.viewport, store.isLoaded, farmId]);

  // Flush pending cloud sync when connectivity returns (flush-then-reload, not in parallel)
  useEffect(() => {
    if (!farmId) return;
    const onOnline = () => {
      void (async () => {
        await store.flushSync(farmId);
        await store.loadData(farmId);
      })();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [farmId]);

  const addBlock = useCallback(
    (block: OrchardBlock) => {
      if (farmId) store.addBlock(farmId, canEdit, block);
    },
    [farmId, canEdit, store.addBlock]
  );

  const updateBlock = useCallback(
    (id: string, updates: Partial<OrchardBlock>) => {
      if (farmId) store.updateBlock(farmId, canEdit, id, updates);
    },
    [farmId, canEdit, store.updateBlock]
  );

  const removeBlock = useCallback(
    (id: string) => {
      if (farmId) store.removeBlock(farmId, canEdit, id);
    },
    [farmId, canEdit, store.removeBlock]
  );

  const addPin = useCallback(
    (pin: InfrastructurePin) => {
      if (farmId) store.addPin(farmId, canEdit, pin);
    },
    [farmId, canEdit, store.addPin]
  );

  const updatePin = useCallback(
    (id: string, updates: Partial<InfrastructurePin>) => {
      if (farmId) store.updatePin(farmId, canEdit, id, updates);
    },
    [farmId, canEdit, store.updatePin]
  );

  const removePin = useCallback(
    (id: string) => {
      if (farmId) store.removePin(farmId, canEdit, id);
    },
    [farmId, canEdit, store.removePin]
  );

  const addTrack = useCallback(
    (track: FarmTrack) => {
      if (farmId) store.addTrack(farmId, canEdit, track);
    },
    [farmId, canEdit, store.addTrack]
  );

  const updateTrack = useCallback(
    (id: string, updates: Partial<FarmTrack>) => {
      if (farmId) store.updateTrack(farmId, canEdit, id, updates);
    },
    [farmId, canEdit, store.updateTrack]
  );

  const removeTrack = useCallback(
    (id: string) => {
      if (farmId) store.removeTrack(farmId, canEdit, id);
    },
    [farmId, canEdit, store.removeTrack]
  );

  const totalAreaHa = store.blocks.reduce((sum, b) => sum + (b.areaHa || 0), 0);

  return {
    blocks: store.blocks,
    pins: store.pins,
    tracks: store.tracks,
    viewport: store.viewport,
    setViewport: store.setViewport,
    addBlock,
    updateBlock,
    removeBlock,
    addPin,
    updatePin,
    removePin,
    addTrack,
    updateTrack,
    removeTrack,
    totalAreaHa,
    loadData: store.loadData,
    setBounds: store.setBounds,
    isLocked: store.isLocked,
    setLocked: store.setLocked,
    isLoaded: store.isLoaded,
    isLoading: store.isLoading,
    error: store.error,
    canEdit,
    pendingSyncCount: store.pendingSyncCount,
    flushSync: store.flushSync,
  };
}
