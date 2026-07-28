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

import type { FarmEnterpriseId, GeometryKindId, TreeSpeciesId } from '../../shared/farm/farmTypes';
import type { InfraTypeId } from '../../shared/farm/infraTypes';

export interface OrchardBlock {
  id: string;
  name: string;
  /** Cultivar / variety / crop label (kept for walnut chill + legacy UI). */
  cultivar: string;
  /** Tree/vine species when cropKind is orchard/fruit/vineyard (e.g. walnut). */
  species?: TreeSpeciesId | string;
  /** Which enterprise this paddock belongs to on a mixed farm. */
  cropKind?: FarmEnterpriseId;
  /** Map interpretation — boundary vs water zone vs dam (skeleton). */
  geometryKind?: GeometryKindId;
  /** Broadacre / hort season label skeleton (e.g. "2026 winter cereal"). */
  seasonLabel?: string;
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
  /** Sensor + farm assets (dam, internal zones, pipe, vehicle, fuel, hazard, …). */
  type: InfraTypeId;
  status: 'active' | 'warning' | 'offline';
  /** Label / centroid — always set (even for polygon/line assets). */
  lat: number;
  lng: number;
  /** Polygon (dam / internal) or LineString (pipeline) GeoJSON Feature/geometry. */
  geojson?: unknown;
  /** Optional Meshy / third-party tracker id (vehicles) — reserved. */
  trackerId?: string;
  notes?: string;
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
  /** Last cloud sync warning (queued / permission) — null when clear. */
  syncError: string | null;
  setViewport: (viewport: MapViewport) => void;
  setLocked: (isLocked: boolean) => void;
  setBounds: (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null) => void;
  clearSyncError: () => void;
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

/** Exposed for LAN pull / settings to force a geometry reload into the Zustand store. */
export const useMapStoreInternal = create<MapState>((set, get) => ({
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
  syncError: null,

  setViewport: (viewport) => set({ viewport }),
  setLocked: (isLocked) => set({ isLocked }),
  clearSyncError: () => set({ syncError: null }),

  setBounds: (bounds) => {
    set({ bounds });
  },

  refreshPendingCount: async (farmId: string) => {
    try {
      const count = await pendingGeometryCount(farmId);
      set({
        pendingSyncCount: count,
        syncError: count === 0 ? null : get().syncError,
      });
    } catch {
      /* ignore */
    }
  },

  flushSync: async (farmId: string) => {
    const result = await flushPendingGeometry(farmId);
    await get().refreshPendingCount(farmId);
    if (result.failed > 0) {
      set({
        syncError: `${result.failed} map change(s) still waiting to sync to the farm cloud.`,
      });
    } else if (result.flushed > 0) {
      set({ syncError: null });
    }
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
      const sync = await persistBlock(farmId, block);
      await get().refreshPendingCount(farmId);
      if (sync.message) set({ syncError: sync.message });
      else if (sync.synced) set({ syncError: null });
    } catch (err) {
      console.error('Failed to save block:', err);
      set({ syncError: 'Failed to save block on this device.' });
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
        const sync = await persistBlock(farmId, updatedBlock);
        await get().refreshPendingCount(farmId);
        if (sync.message) set({ syncError: sync.message });
        else if (sync.synced) set({ syncError: null });
      } catch (err) {
        console.error('Failed to save block:', err);
        set({ syncError: 'Failed to save block on this device.' });
      }
    }
  },

  removeBlock: async (farmId, canEdit, id) => {
    if (!farmId || !canEdit) return;
    loadGeneration += 1;
    set((state) => ({ blocks: state.blocks.filter((b) => b.id !== id) }));
    try {
      const sync = await removeBlockPersisted(farmId, id);
      await get().refreshPendingCount(farmId);
      if (sync.message) set({ syncError: sync.message });
      else if (sync.synced) set({ syncError: null });
    } catch (err) {
      console.error('Failed to delete block:', err);
      set({ syncError: 'Failed to delete block on this device.' });
    }
  },

  addPin: async (farmId, canEdit, pin) => {
    if (!farmId || !canEdit) return;
    loadGeneration += 1;
    set((state) => ({ pins: [...state.pins, pin] }));
    try {
      const sync = await persistPin(farmId, pin);
      await get().refreshPendingCount(farmId);
      if (sync.message) set({ syncError: sync.message });
      else if (sync.synced) set({ syncError: null });
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
        const sync = await persistPin(farmId, updatedPin);
        await get().refreshPendingCount(farmId);
        if (sync.message) set({ syncError: sync.message });
        else if (sync.synced) set({ syncError: null });
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
      const sync = await persistTrack(farmId, track);
      await get().refreshPendingCount(farmId);
      if (sync.message) set({ syncError: sync.message });
      else if (sync.synced) set({ syncError: null });
    } catch (err) {
      console.error('Failed to save track:', err);
      set({ syncError: 'Failed to save track on this device.' });
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
        const sync = await persistTrack(farmId, updatedTrack);
        await get().refreshPendingCount(farmId);
        if (sync.message) set({ syncError: sync.message });
        else if (sync.synced) set({ syncError: null });
      } catch (err) {
        console.error('Failed to save track:', err);
        set({ syncError: 'Failed to save track on this device.' });
      }
    }
  },

  removeTrack: async (farmId, canEdit, id) => {
    if (!farmId || !canEdit) return;
    loadGeneration += 1;
    set((state) => ({ tracks: state.tracks.filter((t) => t.id !== id) }));
    try {
      const sync = await removeTrackPersisted(farmId, id);
      await get().refreshPendingCount(farmId);
      if (sync.message) set({ syncError: sync.message });
      else if (sync.synced) set({ syncError: null });
    } catch (err) {
      console.error('Failed to delete track:', err);
      set({ syncError: 'Failed to delete track on this device.' });
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

  // Multi-device: geometry is local-first + one-shot hydrate (no onSnapshot).
  // Re-hydrate on focus and poll so tablet picks up browser-drawn pins.
  useEffect(() => {
    if (!farmId) return;
    const refresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void store.loadData(farmId);
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', refresh);
    const intervalId = window.setInterval(refresh, 30000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', refresh);
      window.clearInterval(intervalId);
    };
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
    syncError: store.syncError,
    clearSyncError: store.clearSyncError,
    flushSync: store.flushSync,
  };
}
