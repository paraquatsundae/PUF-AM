import { describe, expect, it } from 'vitest';
import { collectHighlightAssignees, mergeHighlightAssignees } from '../src/lib/highlightAssignees';
import {
  buildMapHighlight,
  directedAtFields,
  highlightFromFirestore,
  highlightGeojsonForFirestore,
} from '../src/lib/mapHighlights';

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

  it('lists every farm user, then people only seen on this device', () => {
    const options = mergeHighlightAssignees(
      [
        { id: 'u2', name: 'Sam' },
        { id: 'u1', name: 'George' },
      ],
      [
        { id: 'u2', name: 'Sam on tablet' },
        { id: 'ticket-9', name: 'Tablet' },
      ]
    );
    expect(options).toEqual([
      { id: 'u1', name: 'George' },
      { id: 'u2', name: 'Sam' },
      { id: 'ticket-9', name: 'Tablet' },
    ]);
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

  it('stores a drawn area as text so Firestore can accept the polygon', () => {
    const geojson = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [116.1, -34.2],
          [116.2, -34.2],
          [116.2, -34.3],
          [116.1, -34.2],
        ],
      ],
    };
    const encoded = highlightGeojsonForFirestore(geojson);
    expect(encoded).toContain('116.1');
    expect(JSON.parse(encoded)).toEqual(geojson);
    const back = highlightFromFirestore(
      {
        id: 'h1',
        geojson: encoded,
        createdBy: 'u1',
        displayName: 'Alex',
        audience: 'all',
        expiresAt: '2026-09-29T02:00:00.000Z',
        createdAt: '2026-09-29T01:00:00.000Z',
        note: undefined,
      },
      'h1'
    );
    expect(back?.geojson).toEqual(geojson);
    expect(back && 'note' in back).toBe(true);
  });
});
