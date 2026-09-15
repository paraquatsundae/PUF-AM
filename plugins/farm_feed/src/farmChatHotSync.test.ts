import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const schedule = vi.fn();
vi.mock('../../../src/mist/mistHotBridge', () => ({
  scheduleMistHotAutoPublish: (...args: unknown[]) => schedule(...args),
}));

import { mergeFarmChatHotIncoming } from './farmChatHotSync';
import { buildFarmChatMessage, listFarmChat, writeFarmChatLocal } from './farmChatLog';
import { readFarmChatDay, writeFarmChatDay } from './farmChatDay';

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  schedule.mockClear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
    },
  });
});

afterEach(() => {
  memory.clear();
});

describe('mergeFarmChatHotIncoming', () => {
  const tablet = buildFarmChatMessage({
    text: 'from tablet',
    authorName: 'Tablet',
    id: 'tab-1',
    at: '2026-09-15T08:00:00.000Z',
  })!;
  const linux = buildFarmChatMessage({
    text: 'from linux',
    authorName: 'Linux',
    id: 'lin-1',
    at: '2026-09-15T08:01:00.000Z',
  })!;

  it('keeps a local Linux line when stale APK Hot arrives without it', () => {
    writeFarmChatLocal('farm-x', [tablet, linux]);
    writeFarmChatDay('farm-x', { date: '2026-09-15', messages: [tablet, linux] });
    mergeFarmChatHotIncoming('farm-x', {
      messages: [tablet],
      dayDate: '2026-09-15',
      dayMessages: [tablet],
    });
    expect(readFarmChatDay('farm-x')?.messages.map((row) => row.id).sort()).toEqual(['lin-1', 'tab-1']);
    expect(listFarmChat('farm-x').map((row) => row.id).sort()).toEqual(['lin-1', 'tab-1']);
    expect(schedule).toHaveBeenCalledWith('farm-x');
  });

  it('does not republish when incoming already has every local line', () => {
    writeFarmChatLocal('farm-x', [tablet]);
    writeFarmChatDay('farm-x', { date: '2026-09-15', messages: [tablet] });
    mergeFarmChatHotIncoming('farm-x', {
      messages: [tablet, linux],
      dayDate: '2026-09-15',
      dayMessages: [tablet, linux],
    });
    expect(schedule).not.toHaveBeenCalled();
    expect(listFarmChat('farm-x').map((row) => row.id)).toEqual(['tab-1', 'lin-1']);
  });
});
