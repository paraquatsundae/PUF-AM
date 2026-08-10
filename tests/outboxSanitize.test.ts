/**
 * The poison pill of 2026-08-10: a diary entry with `notes: undefined` failed
 * `setDoc` with `invalid-argument` and was retried every few seconds forever —
 * the outbox never dropped it and never wrote it. Two rules fix that, and both
 * live here:
 *
 * 1. `undefined` never reaches Firestore (`stripUndefinedDeep`).
 * 2. An op that keeps failing *permanently* runs out of attempts
 *    (`OUTBOX_MAX_ATTEMPTS` in `flushFarmOutbox.ts`) — the entry itself stays
 *    in the local store, only the doomed write is dropped.
 */

import { describe, expect, it } from 'vitest';

import { stripUndefinedDeep } from '../src/lib/stripUndefined.ts';

describe('stripUndefinedDeep', () => {
  it('drops the exact shape that wedged the tablet: an optional field left unset', () => {
    const entry = {
      id: 'd542e482',
      date: '2026-08-05',
      type: 'work',
      notes: undefined,
      title: 'Check chill portals',
    };
    expect(stripUndefinedDeep(entry)).toEqual({
      id: 'd542e482',
      date: '2026-08-05',
      type: 'work',
      title: 'Check chill portals',
    });
  });

  it('walks nested objects and arrays', () => {
    const value = {
      a: [{ keep: 1, drop: undefined }, 'text', 3],
      b: { c: { drop: undefined, keep: 'yes' } },
    };
    expect(stripUndefinedDeep(value)).toEqual({
      a: [{ keep: 1 }, 'text', 3],
      b: { c: { keep: 'yes' } },
    });
  });

  it('keeps null — a value Firestore accepts and an author may have meant', () => {
    expect(stripUndefinedDeep({ notes: null })).toEqual({ notes: null });
  });

  it('leaves primitives and empty containers alone', () => {
    expect(stripUndefinedDeep('x')).toBe('x');
    expect(stripUndefinedDeep(0)).toBe(0);
    expect(stripUndefinedDeep(false)).toBe(false);
    expect(stripUndefinedDeep(null)).toBe(null);
    expect(stripUndefinedDeep([])).toEqual([]);
    expect(stripUndefinedDeep({})).toEqual({});
  });
});
