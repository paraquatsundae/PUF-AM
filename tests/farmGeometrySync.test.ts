/**
 * @vitest-environment jsdom
 *
 * Map geometry may queue a Firestore outbox only on a hosted/BYO cloud farm.
 * A Freenet / mist session must not set cloud-pending — that is what put
 * "waiting to sync map to the farm cloud" above the map on both shells.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §1 · §9
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const saveBlock = vi.fn();
const scheduleMistBonesAutoPublish = vi.fn();

vi.mock('../src/lib/workshopMode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/workshopMode')>();
  return {
    ...actual,
    isLocalOnlyFarmSession: () => false,
    isWorkshopMode: () => false,
  };
});

vi.mock('../src/mist/mistBonesBridge', () => ({
  scheduleMistBonesAutoPublish: (...args: unknown[]) => scheduleMistBonesAutoPublish(...args),
}));

vi.mock('../src/services/api', () => ({
  mapApi: {
    saveBlock: (...args: unknown[]) => saveBlock(...args),
    getBlocks: vi.fn().mockResolvedValue(null),
    getPins: vi.fn().mockResolvedValue(null),
    getTracks: vi.fn().mockResolvedValue(null),
    getViewport: vi.fn().mockResolvedValue(null),
    savePin: vi.fn(),
    saveTrack: vi.fn(),
    saveViewport: vi.fn(),
    deleteBlock: vi.fn(),
    deletePin: vi.fn(),
    deleteTrack: vi.fn(),
  },
}));

function seedFreenetSession() {
  localStorage.setItem('pufam.farmStoreBackend', 'mist');
  localStorage.setItem('pufam.mist.session.v1', '{"v":1,"mode":"device","iv":"00","ct":"00"}');
  localStorage.setItem(
    'pufam.mist.sessionMeta.v1',
    JSON.stringify({ farmId: 'mist-1', farmName: 'Shed', displayName: 'G', hasDevicePin: false }),
  );
}

const block = {
  id: 'b1',
  name: 'North',
  cultivar: '',
  density: '',
  irrigation: '',
  geojson: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } },
};

describe('farmGeometrySync — cloud pending vs Freenet', () => {
  beforeEach(() => {
    localStorage.clear();
    saveBlock.mockReset();
    scheduleMistBonesAutoPublish.mockReset();
  });

  it('does not queue a cloud map write on a Freenet session', async () => {
    seedFreenetSession();
    saveBlock.mockRejectedValue(new Error('permission-denied'));

    const { persistBlock, pendingGeometryCount, flushPendingGeometry } = await import(
      '../src/lib/farmGeometrySync'
    );
    const { listPending } = await import('../src/lib/farmGeometryIdb');

    const result = await persistBlock('mist-1', block);
    expect(result.synced).toBe(true);
    expect(result.queued).toBe(false);
    expect(result.message).toBeNull();
    expect(saveBlock).not.toHaveBeenCalled();
    expect(await listPending('mist-1')).toHaveLength(0);
    expect(await pendingGeometryCount('mist-1')).toBe(0);

    const flush = await flushPendingGeometry('mist-1');
    expect(flush).toEqual({ flushed: 0, failed: 0 });
    expect(saveBlock).not.toHaveBeenCalled();
    expect(scheduleMistBonesAutoPublish).toHaveBeenCalledWith('mist-1');
  });

  it('clears leftover cloud-queue rows so the map banner stays off', async () => {
    seedFreenetSession();
    const { enqueuePending, listPending } = await import('../src/lib/farmGeometryIdb');
    await enqueuePending({
      farmId: 'mist-1',
      collection: 'blocks',
      op: 'upsert',
      entityId: 'b1',
      payload: block,
    });
    expect(await listPending('mist-1')).toHaveLength(1);

    const { pendingGeometryCount, flushPendingGeometry } = await import(
      '../src/lib/farmGeometrySync'
    );
    expect(await pendingGeometryCount('mist-1')).toBe(0);
    await flushPendingGeometry('mist-1');
    expect(await listPending('mist-1')).toHaveLength(0);
  });

  it('still queues a cloud map write on a hosted farm when Firestore fails', async () => {
    saveBlock.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));

    const { persistBlock, pendingGeometryCount } = await import('../src/lib/farmGeometrySync');
    const { listPending } = await import('../src/lib/farmGeometryIdb');

    const result = await persistBlock('cloud-1', block);
    expect(result.synced).toBe(false);
    expect(result.queued).toBe(true);
    expect(result.message).toMatch(/cloud/i);
    expect(saveBlock).toHaveBeenCalledOnce();
    expect(await listPending('cloud-1')).toHaveLength(1);
    expect(await pendingGeometryCount('cloud-1')).toBe(1);
    expect(scheduleMistBonesAutoPublish).not.toHaveBeenCalled();
  });

  it('stamps updatedAt on a Freenet paddock save for Bones LWW', async () => {
    seedFreenetSession();
    const { persistBlock } = await import('../src/lib/farmGeometrySync');
    const { getFarmGeometry } = await import('../src/lib/farmGeometryIdb');

    await persistBlock('mist-1', block);
    const stored = await getFarmGeometry('mist-1');
    expect(stored.blocks[0]?.id).toBe('b1');
    expect(typeof (stored.blocks[0] as { updatedAt?: string }).updatedAt).toBe('string');
  });

  it('does not publish Bones on a viewport pan', async () => {
    seedFreenetSession();
    const { persistViewport } = await import('../src/lib/farmGeometrySync');
    await persistViewport('mist-1', { lat: -34.2, lng: 116.1, zoom: 15 });
    expect(scheduleMistBonesAutoPublish).not.toHaveBeenCalled();
  });
});
