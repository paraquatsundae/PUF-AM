import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  save: vi.fn(), remove: vi.fn(), flush: vi.fn(), publish: vi.fn(), cloudSave: vi.fn(),
}));
vi.mock('../src/lib/localFarmRepo', () => ({
  upsertLocalEntity: mocks.save, deleteLocalEntity: mocks.remove,
}));
vi.mock('../src/services/api', () => ({ diaryApi: { saveEvent: mocks.cloudSave } }));
vi.mock('../src/lib/requestFarmOutboxFlush', () => ({ requestFarmOutboxFlush: mocks.flush }));
vi.mock('../src/mist/mistHotBridge', () => ({ scheduleMistHotAutoPublish: mocks.publish }));
import { useFarmDiaryStore } from '../src/lib/farmDiaryStore';

beforeEach(() => {
  vi.resetAllMocks();
  useFarmDiaryStore.setState({ currentFarmId: 'farm', events: [] });
});

describe('diary save boundary', () => {
  it('waits for local durability before updating the screen or requesting cloud sync', async () => {
    let complete!: () => void;
    mocks.save.mockReturnValue(new Promise<void>(resolve => { complete = resolve; }));
    const saving = useFarmDiaryStore.getState().addEvent('farm', true, {
      type: 'work', date: '2026-09-15', title: 'Inspect trees',
    });
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(useFarmDiaryStore.getState().events).toEqual([]);
    expect(mocks.flush).not.toHaveBeenCalled();
    complete();
    await saving;
    expect(useFarmDiaryStore.getState().events).toHaveLength(1);
    expect(mocks.flush).toHaveBeenCalledWith('farm');
    expect(mocks.cloudSave).not.toHaveBeenCalled();
  });

  it('rejects failed saves without adding a phantom record', async () => {
    mocks.save.mockRejectedValue(new Error('Disk full'));
    await expect(useFarmDiaryStore.getState().addEvent('farm', true, {
      type: 'work', date: '2026-09-15',
    })).rejects.toThrow('Disk full');
    expect(useFarmDiaryStore.getState().events).toEqual([]);
    expect(mocks.flush).not.toHaveBeenCalled();
  });

  it('does not remove a visible entry when durable deletion fails', async () => {
    useFarmDiaryStore.setState({ events: [{ id: 'one', type: 'work', date: '2026-09-15' }] });
    mocks.remove.mockRejectedValue(new Error('Disk full'));
    await expect(useFarmDiaryStore.getState().removeEvent('farm', true, 'one')).rejects.toThrow();
    expect(useFarmDiaryStore.getState().events).toHaveLength(1);
  });

  it('does not put a completed save on another farm screen', async () => {
    mocks.save.mockImplementation(async () => {
      useFarmDiaryStore.setState({ currentFarmId: 'other' });
    });
    await useFarmDiaryStore.getState().addEvent('farm', true, { type: 'work', date: '2026-09-15' });
    expect(useFarmDiaryStore.getState().events).toEqual([]);
  });
});
