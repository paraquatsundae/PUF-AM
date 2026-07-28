import { describe, expect, it } from 'vitest';
import {
  isPresenceFresh,
  presenceColourForUid,
  PRESENCE_STALE_MS,
  secondsAgoLabel,
} from '../src/lib/crewPresence';

describe('crewPresence helpers', () => {
  it('isPresenceFresh respects the 45s window', () => {
    const now = Date.parse('2026-07-27T08:00:00.000Z');
    expect(isPresenceFresh(new Date(now - 10_000).toISOString(), now)).toBe(true);
    expect(isPresenceFresh(new Date(now - PRESENCE_STALE_MS - 1).toISOString(), now)).toBe(false);
    expect(isPresenceFresh(undefined, now)).toBe(false);
    expect(isPresenceFresh('not-a-date', now)).toBe(false);
  });

  it('presenceColourForUid is stable and hsl', () => {
    const a = presenceColourForUid('user-abc');
    const b = presenceColourForUid('user-abc');
    const c = presenceColourForUid('user-xyz');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.startsWith('hsl(')).toBe(true);
  });

  it('secondsAgoLabel formats recent times', () => {
    const now = Date.parse('2026-07-27T08:00:00.000Z');
    expect(secondsAgoLabel(new Date(now - 2_000).toISOString(), now)).toBe('just now');
    expect(secondsAgoLabel(new Date(now - 12_000).toISOString(), now)).toBe('12s ago');
    expect(secondsAgoLabel(new Date(now - 120_000).toISOString(), now)).toBe('2m ago');
  });
});
