import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

const cloud = vi.hoisted(() => ({ set: vi.fn(), remove: vi.fn(), localOnly: false }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string, id: string) => `${path}/${id}`,
  setDoc: cloud.set, deleteDoc: cloud.remove,
}));
vi.mock('../src/firebase', () => ({ db: {} }));
vi.mock('../src/lib/workshopMode', () => ({ isLocalOnlyFarmSession: () => cloud.localOnly }));
vi.mock('../src/lib/flushPhotoOutbox', () => ({ flushPhotoOutbox: vi.fn() }));
import { flushFarmOutbox, OUTBOX_MAX_ATTEMPTS } from '../src/lib/flushFarmOutbox';
import { listOutbox, upsertLocalEntity } from '../src/lib/localFarmRepo';

beforeEach(() => {
  vi.resetAllMocks();
  cloud.localOnly = false;
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('navigator', { onLine: true });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const save = (title: string, farm = 'farm') => upsertLocalEntity(farm, 'diary', {
  id: 'one', date: '2026-09-15', type: 'work', title, notes: undefined,
});

describe('single diary cloud writer', () => {
  it('delivers same-millisecond saves in transaction order with replacement semantics', async () => {
    vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-09-15T00:00:00.000Z');
    await save('first');
    await save('second');
    await flushFarmOutbox('farm');
    expect(cloud.set.mock.calls.map(call => call[1].title)).toEqual(['first', 'second']);
    expect(cloud.set.mock.calls.every(call => call.length === 2)).toBe(true);
    expect(cloud.set.mock.calls[0][1]).not.toHaveProperty('notes');
    expect(await listOutbox('farm')).toEqual([]);
  });

  it('serializes overlapping flushes and picks up a save added during delivery', async () => {
    await save('first');
    let release!: () => void;
    cloud.set.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const first = flushFarmOutbox('farm');
    await vi.waitFor(() => expect(cloud.set).toHaveBeenCalledTimes(1));
    await save('second');
    const second = flushFarmOutbox('farm');
    expect(cloud.set).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(cloud.set.mock.calls.map(call => call[1].title)).toEqual(['first', 'second']);
  });

  it('retains failed saves and does not deliver newer edits ahead of them', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await save('first');
    await save('second');
    cloud.set.mockRejectedValue(Object.assign(new Error('Invalid'), { code: 'invalid-argument' }));
    for (let i = 0; i < OUTBOX_MAX_ATTEMPTS + 1; i++) await flushFarmOutbox('farm');
    expect(await listOutbox('farm')).toHaveLength(2);
    expect(cloud.set.mock.calls.every(call => call[1].title === 'first')).toBe(true);
  });

  it('does not let a revoked farm block delivery for another farm', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await save('revoked', 'old-farm');
    await save('allowed', 'new-farm');
    cloud.set.mockRejectedValueOnce(Object.assign(new Error('Denied'), { code: 'permission-denied' }));
    expect(await flushFarmOutbox()).toEqual({ flushed: 1, failed: 1 });
    expect(await listOutbox('old-farm')).toHaveLength(1);
    expect(await listOutbox('new-farm')).toEqual([]);
  });

  it('leaves operations queued offline and in a local-only session', async () => {
    await save('one');
    vi.stubGlobal('navigator', { onLine: false });
    await flushFarmOutbox('farm');
    vi.stubGlobal('navigator', { onLine: true });
    cloud.localOnly = true;
    await flushFarmOutbox('farm');
    expect(cloud.set).not.toHaveBeenCalled();
    expect(await listOutbox('farm')).toHaveLength(1);
  });
});
