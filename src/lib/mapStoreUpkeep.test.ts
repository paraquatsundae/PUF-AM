/**
 * @vitest-environment jsdom
 *
 * `useMapStore` is called from sixteen places and several mount at once —
 * Dashboard alone reaches it three times, directly and through `useWalnutPack`
 * and `useChillPack`. The refresh timer, focus/online listeners and viewport
 * writer used to hang off the hook body, so each caller installed its own set
 * and every one of them reloaded the same farm.
 *
 * These tests pin the shared-upkeep behaviour: one of everything while at least
 * one consumer is mounted, and a clean stop once the last one leaves.
 */
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadFarmGeometryLocalFirst = vi.fn(async () => ({
  blocks: [],
  pins: [],
  tracks: [],
  viewport: { lat: -31.9, lng: 116.0, zoom: 15 },
}));
const persistViewport = vi.fn(async () => {});
const flushPendingGeometry = vi.fn(async () => {});
const pendingGeometryCount = vi.fn(async () => 0);

vi.mock('./farmGeometrySync', () => ({
  loadFarmGeometryLocalFirst: (...a: unknown[]) => loadFarmGeometryLocalFirst(...(a as [])),
  persistViewport: (...a: unknown[]) => persistViewport(...(a as [])),
  flushPendingGeometry: (...a: unknown[]) => flushPendingGeometry(...(a as [])),
  pendingGeometryCount: (...a: unknown[]) => pendingGeometryCount(...(a as [])),
  persistBlock: vi.fn(async () => ({ synced: true })),
  persistPin: vi.fn(async () => ({ synced: true })),
  persistTrack: vi.fn(async () => ({ synced: true })),
  removeBlockPersisted: vi.fn(async () => ({ synced: true })),
  removePinPersisted: vi.fn(async () => ({ synced: true })),
  removeTrackPersisted: vi.fn(async () => ({ synced: true })),
}));

let farmId: string | undefined = 'farm-a';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ userData: farmId ? { farmId, role: 'admin' } : null }),
}));

const { useMapStore } = await import('./mapStore');

describe('farm geometry upkeep', () => {
  beforeEach(() => {
    farmId = 'farm-a';
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('installs one refresh timer no matter how many components mount', () => {
    const setInterval = vi.spyOn(window, 'setInterval');

    const first = renderHook(() => useMapStore());
    const second = renderHook(() => useMapStore());
    const third = renderHook(() => useMapStore());

    expect(setInterval).toHaveBeenCalledTimes(1);

    third.unmount();
    second.unmount();
    first.unmount();
  });

  it('keeps the timer alive until the last consumer unmounts', () => {
    const clearInterval = vi.spyOn(window, 'clearInterval');

    const first = renderHook(() => useMapStore());
    const second = renderHook(() => useMapStore());

    first.unmount();
    expect(clearInterval).not.toHaveBeenCalled();

    second.unmount();
    expect(clearInterval).toHaveBeenCalledTimes(1);
  });

  it('polls once per interval rather than once per consumer', async () => {
    const first = renderHook(() => useMapStore());
    const second = renderHook(() => useMapStore());
    await vi.waitFor(() => expect(loadFarmGeometryLocalFirst).toHaveBeenCalled());
    loadFarmGeometryLocalFirst.mockClear();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(loadFarmGeometryLocalFirst).toHaveBeenCalledTimes(1);

    first.unmount();
    second.unmount();
  });

  it('survives a farm switch with several consumers mounted', () => {
    const setInterval = vi.spyOn(window, 'setInterval');
    const clearInterval = vi.spyOn(window, 'clearInterval');

    const first = renderHook(() => useMapStore());
    const second = renderHook(() => useMapStore());
    const third = renderHook(() => useMapStore());

    farmId = 'farm-b';
    first.rerender();
    second.rerender();
    third.rerender();

    // One live timer for the new farm, whatever order the effects ran in.
    expect(setInterval.mock.calls.length - clearInterval.mock.calls.length).toBe(1);

    // Losing one consumer must not strand the two still on screen.
    clearInterval.mockClear();
    first.unmount();
    expect(clearInterval).not.toHaveBeenCalled();

    second.unmount();
    expect(clearInterval).not.toHaveBeenCalled();

    third.unmount();
    expect(clearInterval).toHaveBeenCalledTimes(1);
  });

  it('restarts upkeep against the new farm when the farm changes', () => {
    const setInterval = vi.spyOn(window, 'setInterval');
    const clearInterval = vi.spyOn(window, 'clearInterval');

    const view = renderHook(() => useMapStore());
    expect(setInterval).toHaveBeenCalledTimes(1);

    farmId = 'farm-b';
    view.rerender();

    expect(clearInterval).toHaveBeenCalledTimes(1);
    expect(setInterval).toHaveBeenCalledTimes(2);

    view.unmount();
  });
});
