/**
 * Highlight + instructions → diary work plan in the same save.
 */
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  attachDiaryToHighlight,
  buildHighlightWorkEvent,
  highlightDiaryPath,
  highlightHasTask,
  persistHighlightAndDiary,
  planHighlightDiary,
} from '../src/lib/highlightDiary';
import { buildMapHighlight, sameVisibleHighlights } from '../src/lib/mapHighlights';
import { listLocalEntities } from '../src/lib/localFarmRepo';
import type { DiaryEvent } from '../src/lib/farmDiaryTypes';

const FARM_ID = 'highlight-diary-farm-0001';

const sampleGeo: GeoJSON.Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [115.0, -34.0],
      [115.01, -34.0],
      [115.01, -34.01],
      [115.0, -34.01],
      [115.0, -34.0],
    ],
  ],
};

describe('highlight diary', () => {
  it('treats a note or a directed-at name as a task', () => {
    expect(highlightHasTask({ note: 'Check the valve' })).toBe(true);
    expect(highlightHasTask({ directedAtName: 'Tablet crew' })).toBe(true);
    expect(highlightHasTask({ note: '  ', directedAtName: '' })).toBe(false);
  });

  it('builds a work plan with sender, directed-at, instructions, and highlight id', () => {
    const event = buildHighlightWorkEvent({
      highlightId: 'hl-1',
      diaryEventId: 'de-1',
      note: 'Check the south valve',
      createdBy: 'mist_owner',
      createdByName: 'George',
      assignedTo: 'ticket-row-9',
      assignedToName: 'Tablet crew',
      nowMs: Date.parse('2026-09-12T14:00:00.000Z'),
    });
    expect(event.type).toBe('work');
    expect(event.status).toBe('planned');
    expect(event.id).toBe('de-1');
    expect(event.createdByName).toBe('George');
    expect(event.createdBy).toBe('mist_owner');
    expect(event.assignedToName).toBe('Tablet crew');
    expect(event.assignedTo).toBe('ticket-row-9');
    expect(event.notes).toBe('Check the south valve');
    expect(event.linkedHighlightId).toBe('hl-1');
    expect(highlightDiaryPath(event.id)).toBe('/diary?event=de-1');
  });

  it('popup target id is the diary entry written with the highlight', async () => {
    const now = Date.parse('2026-09-12T14:30:00.000Z');
    const highlight = buildMapHighlight({
      geojson: sampleGeo,
      createdBy: 'mist_owner',
      displayName: 'George',
      note: 'Check the south valve',
      directedAtName: 'Tablet crew',
      directedAtUid: 'ticket-row-9',
      durationSeconds: 300,
      nowMs: now,
    });
    const diary = planHighlightDiary(highlight, now);
    expect(diary).not.toBeNull();
    const saved = await persistHighlightAndDiary(FARM_ID, highlight, diary, {
      queueCloud: false,
    });
    expect(saved.highlight.linkedDiaryEventId).toBe(saved.diary?.id);
    expect(saved.diary?.linkedHighlightId).toBe(saved.highlight.id);
    expect(attachDiaryToHighlight(highlight, diary!.id).linkedDiaryEventId).toBe(diary!.id);

    const storedDiary = await listLocalEntities<DiaryEvent>(FARM_ID, 'diary');
    expect(storedDiary).toHaveLength(1);
    expect(storedDiary[0]?.id).toBe(saved.diary?.id);
    expect(storedDiary[0]?.type).toBe('work');
    expect(storedDiary[0]?.createdByName).toBe('George');
  });

  it('sameVisibleHighlights ignores a new array of the same pulse', () => {
    const now = Date.parse('2026-09-12T14:30:00.000Z');
    const highlight = buildMapHighlight({
      geojson: sampleGeo,
      createdBy: 'mist_owner',
      displayName: 'George',
      note: 'Valve',
      durationSeconds: 300,
      nowMs: now,
    });
    expect(sameVisibleHighlights([highlight], [{ ...highlight }])).toBe(true);
    expect(
      sameVisibleHighlights([highlight], [{ ...highlight, note: 'Other' }])
    ).toBe(false);
  });
});
