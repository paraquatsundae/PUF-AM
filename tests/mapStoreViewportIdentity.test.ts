/**
 * The viewport object's identity is a signal that the map moved, not a clock.
 *
 * `loadData` deserialises a fresh viewport out of IndexedDB every run, and the
 * farm upkeep poll runs it every 30 seconds. That made a new object appear
 * twice a minute on an idle tab, and consumers keying work off it re-ran: the
 * blight page derives `processedStations` from the viewport, that sits in the
 * dependency array of its weather load effect, so an untouched Blight Risk page
 * refetched weather and re-ran the model on every poll.
 *
 * These assertions are on `toBe` — reference equality — deliberately. `toEqual`
 * would pass against the exact bug this guards.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => ({}) }));

const loadFarmGeometryLocalFirst = vi.fn();

vi.mock('../src/lib/farmGeometrySync', () => ({
  loadFarmGeometryLocalFirst: (farmId: string) => loadFarmGeometryLocalFirst(farmId),
  flushPendingGeometry: vi.fn().mockResolvedValue(undefined),
  pendingGeometryCount: vi.fn().mockResolvedValue(0),
  persistBlock: vi.fn(),
  persistPin: vi.fn(),
  persistTrack: vi.fn(),
  persistViewport: vi.fn().mockResolvedValue(undefined),
  removeBlockPersisted: vi.fn(),
  removePinPersisted: vi.fn(),
  removeTrackPersisted: vi.fn(),
}));

const { useMapStoreInternal, sameViewport } = await import('../src/lib/mapStore');

/** A distinct object each call — what deserialising from IndexedDB gives you. */
function bundleAt(lat: number, lng: number, zoom: number) {
  return { blocks: [], pins: [], tracks: [], viewport: { lat, lng, zoom } };
}

describe('sameViewport', () => {
  it('compares position, not object identity', () => {
    expect(sameViewport({ lat: -34, lng: 116, zoom: 15 }, { lat: -34, lng: 116, zoom: 15 })).toBe(
      true
    );
  });

  it('separates a change in any one component', () => {
    const base = { lat: -34, lng: 116, zoom: 15 };
    expect(sameViewport(base, { ...base, lat: -34.1 })).toBe(false);
    expect(sameViewport(base, { ...base, lng: 116.1 })).toBe(false);
    expect(sameViewport(base, { ...base, zoom: 16 })).toBe(false);
  });
});

describe('viewport identity across a reload', () => {
  beforeEach(() => {
    loadFarmGeometryLocalFirst.mockReset();
  });

  it('keeps the same object when the poll returns the same place', async () => {
    loadFarmGeometryLocalFirst.mockImplementation(async () => bundleAt(-34.24, 116.14, 16));

    await useMapStoreInternal.getState().loadData('farm_1');
    const first = useMapStoreInternal.getState().viewport;

    // The 30-second poll: same place, freshly deserialised object.
    await useMapStoreInternal.getState().loadData('farm_1');
    const second = useMapStoreInternal.getState().viewport;

    expect(second).toBe(first);
  });

  it('takes the new object when the map actually moved', async () => {
    loadFarmGeometryLocalFirst.mockImplementation(async () => bundleAt(-34.24, 116.14, 16));
    await useMapStoreInternal.getState().loadData('farm_1');
    const before = useMapStoreInternal.getState().viewport;

    loadFarmGeometryLocalFirst.mockImplementation(async () => bundleAt(-34.9, 117.2, 14));
    await useMapStoreInternal.getState().loadData('farm_1');
    const after = useMapStoreInternal.getState().viewport;

    expect(after).not.toBe(before);
    expect(after).toEqual({ lat: -34.9, lng: 117.2, zoom: 14 });
  });
});

describe('setViewport', () => {
  it('does not churn identity when the map reports the position it already had', () => {
    const { setViewport } = useMapStoreInternal.getState();
    setViewport({ lat: -34.24, lng: 116.14, zoom: 16 });
    const first = useMapStoreInternal.getState().viewport;

    setViewport({ lat: -34.24, lng: 116.14, zoom: 16 });
    expect(useMapStoreInternal.getState().viewport).toBe(first);
  });

  it('still publishes a real move', () => {
    const { setViewport } = useMapStoreInternal.getState();
    setViewport({ lat: -34.24, lng: 116.14, zoom: 16 });
    const first = useMapStoreInternal.getState().viewport;

    setViewport({ lat: -34.24, lng: 116.14, zoom: 17 });
    expect(useMapStoreInternal.getState().viewport).not.toBe(first);
  });
});
