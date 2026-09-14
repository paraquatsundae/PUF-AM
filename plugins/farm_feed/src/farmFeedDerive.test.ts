import { describe, expect, it } from 'vitest';
import type { DiaryEvent } from '../../../src/lib/farmDiaryTypes';
import type { FieldIssue } from '../../../src/lib/fieldStore';
import type { MapHighlightDoc } from '../../../src/lib/mapHighlights';
import {
  deriveFarmFeedItems,
  deriveIssueFeedItem,
  feedPersonMatches,
  unreadForYouCount,
  type FarmFeedPerson,
} from './farmFeedDerive';

const dave: FarmFeedPerson = { uid: 'uid-dave', names: ['Dave', 'dave tablet'] };

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

function highlight(
  partial: Partial<MapHighlightDoc> & Pick<MapHighlightDoc, 'id'>
): MapHighlightDoc {
  return {
    geojson: { type: 'Point', coordinates: [116, -31] },
    createdBy: 'uid-sam',
    displayName: 'Sam',
    audience: 'all',
    expiresAt: '2026-09-16T00:00:00.000Z',
    createdAt: '2026-09-15T02:00:00.000Z',
    ...partial,
  };
}

function diary(partial: Partial<DiaryEvent> & Pick<DiaryEvent, 'id'>): DiaryEvent {
  return {
    date: '2026-09-15',
    type: 'work',
    ...partial,
  };
}

describe('For you matching', () => {
  it('empty Directed at is Everyone, not For you', () => {
    expect(feedPersonMatches(dave, undefined, undefined)).toEqual({
      everyone: true,
      forYou: false,
    });
    expect(feedPersonMatches(dave, '', '  ')).toEqual({ everyone: true, forYou: false });
  });

  it('matches this device by uid, then by name (case-insensitive)', () => {
    expect(feedPersonMatches(dave, 'uid-dave', 'Someone else')).toEqual({
      everyone: false,
      forYou: true,
    });
    expect(feedPersonMatches(dave, undefined, 'DAVE')).toEqual({
      everyone: false,
      forYou: true,
    });
    expect(feedPersonMatches(dave, 'uid-other', 'Pat')).toEqual({
      everyone: false,
      forYou: false,
    });
  });
});

describe('deriveFarmFeedItems', () => {
  it('sorts newest first and tags Everyone vs For you', () => {
    const items = deriveFarmFeedItems({
      issues: [
        issue({
          id: 'i1',
          note: 'Sprayer is down',
          reportedAt: '2026-09-15T01:00:00.000Z',
        }),
        issue({
          id: 'i2',
          note: 'Check pump',
          directedAtUid: 'uid-dave',
          directedAtName: 'Dave',
          reportedAt: '2026-09-15T03:00:00.000Z',
          photoUrl: 'https://example.test/pump.jpg',
        }),
      ],
      highlights: [
        highlight({
          id: 'h1',
          note: 'This tree',
          directedAtName: 'Dave',
          createdAt: '2026-09-15T02:00:00.000Z',
        }),
      ],
      events: [
        diary({
          id: 'd1',
          title: 'Fix fence',
          assignedTo: 'uid-dave',
          assignedToName: 'Dave',
          updatedAt: '2026-09-15T00:30:00.000Z',
        }),
      ],
      person: dave,
    });

    expect(items.map((row) => row.id)).toEqual(['issue:i2', 'highlight:h1', 'issue:i1', 'diary:d1']);
    expect(items[0]).toMatchObject({
      forYou: true,
      everyone: false,
      photoSrc: 'https://example.test/pump.jpg',
    });
    expect(items.find((row) => row.id === 'issue:i1')).toMatchObject({
      everyone: true,
      forYou: false,
      title: 'Sprayer is down',
    });
  });

  it('does not invent FarmSeed or a Freenet slot on a feed item', () => {
    const item = deriveIssueFeedItem(
      issue({ id: 'plain', note: 'Gate latch' }),
      dave
    );
    const blob = JSON.stringify(item);
    expect(blob).not.toMatch(/FarmSeed|BonesKey|mist-fc-/i);
    expect(item).not.toHaveProperty('farmSeed');
    expect(item).not.toHaveProperty('bonesKey');
  });

  it('counts unread For you after last-seen', () => {
    const items = deriveFarmFeedItems({
      issues: [
        issue({
          id: 'old',
          directedAtUid: 'uid-dave',
          reportedAt: '2026-09-14T00:00:00.000Z',
        }),
        issue({
          id: 'new',
          directedAtUid: 'uid-dave',
          reportedAt: '2026-09-15T12:00:00.000Z',
        }),
      ],
      highlights: [],
      events: [],
      person: dave,
    });
    expect(unreadForYouCount(items, '2026-09-15T06:00:00.000Z')).toBe(1);
    expect(unreadForYouCount(items, null)).toBe(2);
  });
});
