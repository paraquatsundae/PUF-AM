import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deriveFarmFeedItems,
  forYouItems,
  type FarmFeedPerson,
} from './farmFeedDerive';
import type { FieldIssue } from '../../../src/lib/fieldStore';
import {
  appendFarmChat,
  buildFarmChatMessage,
  farmChatAuthorName,
  farmChatHotWatchPairOk,
  farmChatLooksSecret,
  FARM_CHAT_CAP,
  FARM_CHAT_LIVE_CAP,
  listFarmChat,
  mergeFarmChatLogs,
  parseFarmChatMessages,
  trimFarmChat,
  writeFarmChatLocal,
} from './farmChatLog';

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
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

const dave: FarmFeedPerson = { uid: 'uid-dave', names: ['Dave'] };

function issue(partial: Partial<FieldIssue> & Pick<FieldIssue, 'id'>): FieldIssue {
  return {
    lat: -31,
    lng: 116,
    category: 'other',
    priority: 'medium',
    status: 'open',
    reportedBy: 'uid-sam',
    reportedAt: '2026-09-15T01:00:00.000Z',
    ...partial,
  };
}

describe('farm chat send + cap', () => {
  it('builds a whole-farm line with who + when, never FarmSeed', () => {
    const msg = buildFarmChatMessage({
      text: '  Sprayer is down, use the ute  ',
      authorName: 'Sam',
      authorUid: 'uid-sam',
      at: '2026-09-15T08:00:00.000Z',
      id: 'c1',
    });
    expect(msg).toMatchObject({
      id: 'c1',
      authorName: 'Sam',
      text: 'Sprayer is down, use the ute',
      authorUid: 'uid-sam',
    });
    expect(JSON.stringify(msg)).not.toMatch(/FarmSeed|mist-fc-|BonesKey/i);
  });

  it('refuses FarmSeed / FarmCode-shaped text and author', () => {
    expect(farmChatLooksSecret('here is a FarmSeed do not share')).toBe(true);
    expect(buildFarmChatMessage({ text: 'mist-fc-2 ABCDE', authorName: 'Sam' })).toBeNull();
    expect(farmChatAuthorName('FarmSeed')).toBe('Crew');
  });

  it('trims to the last N messages', () => {
    const rows = Array.from({ length: FARM_CHAT_CAP + 12 }, (_, i) =>
      buildFarmChatMessage({
        text: `line ${i}`,
        authorName: 'Sam',
        at: `2026-09-15T${String(8 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00.000Z`,
        id: `c${i}`,
      })
    ).filter((row): row is NonNullable<typeof row> => Boolean(row));
    const trimmed = trimFarmChat(rows);
    expect(FARM_CHAT_LIVE_CAP).toBe(5);
    expect(trimmed).toHaveLength(FARM_CHAT_LIVE_CAP);
    expect(trimmed[0]?.text).toBe(`line ${12}`);
    expect(trimmed[trimmed.length - 1]?.text).toBe(`line ${FARM_CHAT_CAP + 11}`);
  });

  it('append + merge stay capped and union by id', () => {
    const a = buildFarmChatMessage({ text: 'one', authorName: 'Sam', id: 'a', at: '2026-09-15T01:00:00.000Z' })!;
    const b = buildFarmChatMessage({ text: 'two', authorName: 'Dave', id: 'b', at: '2026-09-15T02:00:00.000Z' })!;
    expect(appendFarmChat([a], b).map((row) => row.id)).toEqual(['a', 'b']);
    expect(mergeFarmChatLogs([a], [a, b]).map((row) => row.id)).toEqual(['a', 'b']);
    writeFarmChatLocal('farm-x', [a]);
    expect(listFarmChat('farm-x')).toEqual([a]);
  });

  it('drops photo-shaped leftovers when parsing', () => {
    const parsed = parseFarmChatMessages([
      {
        id: 'p1',
        at: '2026-09-15T03:00:00.000Z',
        authorName: 'Sam',
        text: 'ute is free',
        photoUrl: 'https://example.test/x.jpg',
        photoData: 'data:image/jpeg;base64,xxxx',
      },
    ]);
    expect(parsed[0]).toEqual({
      id: 'p1',
      at: '2026-09-15T03:00:00.000Z',
      authorName: 'Sam',
      text: 'ute is free',
    });
    expect(parsed[0]).not.toHaveProperty('photoUrl');
    expect(parsed[0]).not.toHaveProperty('photoData');
  });
});

describe('For you stays on directed pings', () => {
  it('appending chat does not change For you derivation', () => {
    const items = deriveFarmFeedItems({
      issues: [
        issue({
          id: 'i2',
          note: 'Check pump',
          directedAtUid: 'uid-dave',
          directedAtName: 'Dave',
        }),
      ],
      highlights: [],
      events: [],
      person: dave,
    });
    const before = forYouItems(items);
    appendFarmChat(
      [],
      buildFarmChatMessage({ text: 'ute is free', authorName: 'Sam', id: 'chat-1' })!
    );
    expect(forYouItems(items)).toEqual(before);
    expect(before).toHaveLength(1);
    expect(before[0]?.forYou).toBe(true);
  });
});

describe('Freenet hash/URI pair', () => {
  it('refuses a new hash with a missing URI (Bones lesson)', () => {
    expect(farmChatHotWatchPairOk({ hotContentHash: 'abc', hotUri: 'fn02@x' })).toBe(true);
    expect(farmChatHotWatchPairOk({ hotContentHash: 'abc', hotUri: '' })).toBe(false);
    expect(farmChatHotWatchPairOk({ hotContentHash: '', hotUri: 'fn02@x' })).toBe(false);
    expect(farmChatHotWatchPairOk({ farmChatHash: 'c-new', hotUri: '' })).toBe(false);
    expect(farmChatHotWatchPairOk({})).toBe(true);
  });
});
