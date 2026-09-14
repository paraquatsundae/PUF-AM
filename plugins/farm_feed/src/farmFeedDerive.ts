/**
 * Derive Farm feed items from issues / highlights / diary already on device.
 * No Firestore. No Freenet slot. Plans/FARM_MESSAGING.md
 */
import { directedAtIsEmpty, isDirectedAtYou } from '../../../src/lib/directedAtMatch';
import type { DiaryEvent } from '../../../src/lib/farmDiaryTypes';
import { listIssuePhotoRefs } from '../../../src/lib/farmPhoto';
import type { FieldIssue } from '../../../src/lib/fieldStore';
import type { MapHighlightDoc } from '../../../src/lib/mapHighlights';

export type FarmFeedKind = 'issue' | 'highlight' | 'diary';

export type FarmFeedPerson = {
  uid?: string | null;
  names: readonly (string | null | undefined)[];
};

export type FarmFeedItem = {
  id: string;
  kind: FarmFeedKind;
  at: string;
  title: string;
  body?: string;
  everyone: boolean;
  forYou: boolean;
  directedAtName?: string;
  href: string;
  /** Existing issue photo only — never a new upload. */
  photoSrc?: string;
};

export function feedPersonMatches(
  person: FarmFeedPerson,
  directedAtUid?: string | null,
  directedAtName?: string | null
): { everyone: boolean; forYou: boolean } {
  const everyone = directedAtIsEmpty(directedAtUid, directedAtName);
  return {
    everyone,
    forYou: isDirectedAtYou({
      directedAtUid,
      directedAtName,
      personUid: person.uid,
      personNames: person.names,
    }),
  };
}

function issuePhotoSrc(issue: FieldIssue): string | undefined {
  const refs = listIssuePhotoRefs(issue);
  const withUrl = refs.find((p) => p.url);
  if (withUrl?.url) return withUrl.url;
  if (issue.photoUrl) return issue.photoUrl;
  if (issue.photoData) return issue.photoData;
  return undefined;
}

export function deriveIssueFeedItem(issue: FieldIssue, person: FarmFeedPerson): FarmFeedItem {
  const ping = feedPersonMatches(person, issue.directedAtUid, issue.directedAtName);
  return {
    id: `issue:${issue.id}`,
    kind: 'issue',
    at: issue.updatedAt || issue.reportedAt,
    title: (issue.note || '').trim() || issue.category,
    body: issue.note?.trim() && issue.note.trim() !== issue.category ? undefined : issue.priority,
    everyone: ping.everyone,
    forYou: ping.forYou,
    directedAtName: issue.directedAtName,
    href: `/map?issue=${encodeURIComponent(issue.id)}`,
    photoSrc: issuePhotoSrc(issue),
  };
}

export function deriveHighlightFeedItem(
  highlight: MapHighlightDoc,
  person: FarmFeedPerson
): FarmFeedItem {
  const ping = feedPersonMatches(person, highlight.directedAtUid, highlight.directedAtName);
  const note = (highlight.note || '').trim();
  return {
    id: `highlight:${highlight.id}`,
    kind: 'highlight',
    at: highlight.updatedAt || highlight.createdAt,
    title: note || 'Check this',
    body: highlight.displayName ? `From ${highlight.displayName}` : undefined,
    everyone: ping.everyone,
    forYou: ping.forYou,
    directedAtName: highlight.directedAtName,
    href: highlight.linkedDiaryEventId
      ? `/diary?event=${encodeURIComponent(highlight.linkedDiaryEventId)}`
      : '/map',
  };
}

export function deriveDiaryFeedItem(event: DiaryEvent, person: FarmFeedPerson): FarmFeedItem {
  const ping = feedPersonMatches(person, event.assignedTo, event.assignedToName);
  const title = (event.title || event.notes || event.type).trim();
  return {
    id: `diary:${event.id}`,
    kind: 'diary',
    at: event.updatedAt || event.completedAt || event.date,
    title,
    body: event.assignedToName
      ? `Assigned: ${event.assignedToName}`
      : ping.everyone
        ? 'Everyone'
        : undefined,
    everyone: ping.everyone,
    forYou: ping.forYou,
    directedAtName: event.assignedToName,
    href: `/diary?event=${encodeURIComponent(event.id)}`,
  };
}

export function deriveFarmFeedItems(input: {
  issues: readonly FieldIssue[];
  highlights: readonly MapHighlightDoc[];
  events: readonly DiaryEvent[];
  person: FarmFeedPerson;
}): FarmFeedItem[] {
  const items = [
    ...input.issues.map((row) => deriveIssueFeedItem(row, input.person)),
    ...input.highlights.map((row) => deriveHighlightFeedItem(row, input.person)),
    ...input.events.map((row) => deriveDiaryFeedItem(row, input.person)),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

export function forYouItems(items: readonly FarmFeedItem[]): FarmFeedItem[] {
  return items.filter((item) => item.forYou);
}

export function unreadForYouCount(items: readonly FarmFeedItem[], lastSeenIso: string | null): number {
  const last = lastSeenIso ? Date.parse(lastSeenIso) : 0;
  const floor = Number.isFinite(last) ? last : 0;
  return forYouItems(items).filter((item) => {
    const t = Date.parse(item.at);
    return Number.isFinite(t) && t > floor;
  }).length;
}
