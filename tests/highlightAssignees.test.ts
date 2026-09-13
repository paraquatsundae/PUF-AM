import { describe, expect, it } from 'vitest';
import { collectHighlightAssignees } from '../src/lib/highlightAssignees';
import { buildMapHighlight, directedAtFields } from '../src/lib/mapHighlights';

describe('highlight assignees', () => {
  it('dedupes session, presence, and People labels by name', () => {
    const options = collectHighlightAssignees({
      sessionName: 'George',
      sessionId: 'mist_abc',
      lastDisplayName: 'george',
      presence: [{ uid: 'u2', displayName: 'Sam' }, { uid: 'u3', displayName: 'George' }],
      ledger: [{ id: 't1', label: 'Tablet' }, { id: 't2', label: '  ' }],
    });
    expect(options.map((o) => o.name)).toEqual(['George', 'Sam', 'Tablet']);
    expect(options[0]?.id).toBe('mist_abc');
  });

  it('directedAtFields drops blanks and trims', () => {
    expect(directedAtFields({ directedAtName: '  Sam  ', directedAtUid: ' u2 ' })).toEqual({
      directedAtName: 'Sam',
      directedAtUid: 'u2',
    });
    expect(directedAtFields({ directedAtName: '   ', directedAtUid: '' })).toEqual({});
  });
});

describe('buildMapHighlight directed-at', () => {
  it('persists who the area is for', () => {
    const doc = buildMapHighlight({
      geojson: { type: 'Point', coordinates: [115, -34] },
      createdBy: 'u1',
      displayName: 'Alex',
      durationSeconds: 120,
      directedAtName: 'Sam',
      directedAtUid: 'u2',
      nowMs: Date.parse('2026-09-12T00:00:00.000Z'),
    });
    expect(doc.directedAtName).toBe('Sam');
    expect(doc.directedAtUid).toBe('u2');
    expect(doc.updatedAt).toBe(doc.createdAt);
  });
});
