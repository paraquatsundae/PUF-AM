import { describe, expect, it } from 'vitest';
import { farmChatLogsVisible } from './farmChatArchive';
import {
  adoptLegacyFarmChatCache,
  appendFarmChatDay,
  farmChatCalendarDate,
  farmChatDayRolled,
  farmChatHasLocalOnly,
  FARM_CHAT_TZ,
  mergeFarmChatDayIncoming,
  visibleFarmChat,
} from './farmChatDay';
import { buildFarmChatMessage, FARM_CHAT_LIVE_CAP } from './farmChatLog';

describe('farm chat calendar (Australia/Perth)', () => {
  it('uses Perth, not UTC, so 16:00Z is the next day', () => {
    expect(FARM_CHAT_TZ).toBe('Australia/Perth');
    expect(farmChatCalendarDate('2026-09-15T15:59:00.000Z')).toBe('2026-09-15');
    expect(farmChatCalendarDate('2026-09-15T16:00:00.000Z')).toBe('2026-09-16');
    expect(farmChatDayRolled('2026-09-15', '2026-09-16')).toBe(true);
    expect(farmChatDayRolled('2026-09-16', '2026-09-16')).toBe(false);
  });
});

describe('live 5 vs day buffer', () => {
  it('UI shows only the last 5 while the day buffer keeps the rest', () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      buildFarmChatMessage({
        text: `line ${i}`,
        authorName: 'Sam',
        id: `c${i}`,
        at: `2026-09-15T08:0${i}:00.000Z`,
      })!
    );
    expect(visibleFarmChat(rows)).toHaveLength(FARM_CHAT_LIVE_CAP);
    expect(visibleFarmChat(rows).map((row) => row.text)).toEqual([
      'line 3',
      'line 4',
      'line 5',
      'line 6',
      'line 7',
    ]);
    const day = rows.reduce(
      (acc, row) => appendFarmChatDay(acc, row, '2026-09-15'),
      null as ReturnType<typeof appendFarmChatDay> | null
    );
    expect(day.messages).toHaveLength(8);
  });

  it('day roll leaves yesterday in pendingArchive and starts today empty-ish', () => {
    const yesterday = buildFarmChatMessage({
      text: 'ute is free',
      authorName: 'Sam',
      id: 'y1',
      at: '2026-09-14T08:00:00.000Z',
    })!;
    const today = buildFarmChatMessage({
      text: 'sprayer is down',
      authorName: 'Dave',
      id: 't1',
      at: '2026-09-15T08:00:00.000Z',
    })!;
    const adopted = adoptLegacyFarmChatCache([yesterday, today], '2026-09-15');
    expect(adopted.day.date).toBe('2026-09-15');
    expect(adopted.day.messages.map((row) => row.id)).toEqual(['t1']);
    expect(adopted.pendingArchive.get('2026-09-14')?.map((row) => row.id)).toEqual(['y1']);
    expect(adopted.live).toHaveLength(2);
  });
});

describe('Freenet incoming merge (Linux ↔ APK)', () => {
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

  it('does not wipe local day lines when a stale Hot last-writer arrives', () => {
    const local = { date: '2026-09-15', messages: [tablet, linux] };
    const merged = mergeFarmChatDayIncoming(local, '2026-09-15', [tablet]);
    expect(merged?.messages.map((row) => row.id).sort()).toEqual(['lin-1', 'tab-1']);
  });

  it('ignores an older incoming calendar day', () => {
    const local = { date: '2026-09-16', messages: [linux] };
    const merged = mergeFarmChatDayIncoming(local, '2026-09-15', [tablet]);
    expect(merged?.date).toBe('2026-09-16');
    expect(merged?.messages.map((row) => row.id)).toEqual(['lin-1']);
  });

  it('flags republish when this device still has a line Hot omitted', () => {
    expect(farmChatHasLocalOnly([tablet, linux], null, [tablet], [tablet])).toBe(true);
    expect(farmChatHasLocalOnly([tablet], null, [tablet, linux], [tablet, linux])).toBe(false);
    expect(farmChatHasLocalOnly([tablet], null, [], undefined)).toBe(false);
  });
});

describe('admin download gate', () => {
  it('farm admin sees download; crew does not', () => {
    expect(farmChatLogsVisible('admin')).toBe(true);
    expect(farmChatLogsVisible('farmer')).toBe(false);
    expect(farmChatLogsVisible('viewer')).toBe(false);
    expect(farmChatLogsVisible(null)).toBe(false);
  });
});
