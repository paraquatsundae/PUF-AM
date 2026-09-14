import { describe, expect, it } from 'vitest';
import {
  appendTrailPoint,
  canEnableEveryoneTrails,
  isVehiclePresence,
  pruneTrail,
  trailOpacityAt,
  TRAIL_WINDOW_MS,
} from '../src/lib/breadTrails';
import {
  buildMapHighlight,
  canDeleteMapHighlight,
  HIGHLIGHT_CUSTOM_HOURS_MAX,
  HIGHLIGHT_DEFAULT_SECONDS,
  HIGHLIGHT_DURATION_PRESET_LABELS,
  HIGHLIGHT_DURATION_PRESETS_SEC,
  HIGHLIGHT_FREENET_DEFAULT_SECONDS,
  HIGHLIGHT_MAX_SECONDS,
  HIGHLIGHT_MIN_CUSTOM_SECONDS,
  highlightCustomHoursToSeconds,
  isHighlightActive,
  parseHighlightCustomHours,
  resolveHighlightDurationSeconds,
} from '../src/lib/mapHighlights';

describe('mapHighlights duration / delete', () => {
  it('viewers always get farm default duration', () => {
    expect(
      resolveHighlightDurationSeconds({
        role: 'viewer',
        farmDefaultSeconds: 30,
        chosenSeconds: 300,
      })
    ).toBe(30);
    expect(
      resolveHighlightDurationSeconds({
        role: 'farmer',
        farmDefaultSeconds: 30,
        chosenSeconds: 120,
      })
    ).toBe(120);
    expect(
      resolveHighlightDurationSeconds({
        role: 'admin',
        farmDefaultSeconds: undefined,
        chosenSeconds: null,
      })
    ).toBe(HIGHLIGHT_DEFAULT_SECONDS);
  });

  it('delete allowed for admin, farmer, or creator', () => {
    const h = { createdBy: 'u1' };
    expect(canDeleteMapHighlight(h, 'u1', 'viewer')).toBe(true);
    expect(canDeleteMapHighlight(h, 'u2', 'viewer')).toBe(false);
    expect(canDeleteMapHighlight(h, 'u2', 'farmer')).toBe(true);
    expect(canDeleteMapHighlight(h, 'u2', 'admin')).toBe(true);
  });

  it('buildMapHighlight sets expiry from duration', () => {
    const now = Date.parse('2026-07-28T04:00:00.000Z');
    const doc = buildMapHighlight({
      geojson: { type: 'Point', coordinates: [115, -34] },
      createdBy: 'u1',
      displayName: 'Alex',
      durationSeconds: 30,
      nowMs: now,
    });
    expect(isHighlightActive(doc.expiresAt, now + 10_000)).toBe(true);
    expect(isHighlightActive(doc.expiresAt, now + 31_000)).toBe(false);
    expect(doc.colour).toMatch(/^hsl\(/);
  });

  it('compose presets are 30 sec, 5 min, 1 hour, 12 hr', () => {
    expect([...HIGHLIGHT_DURATION_PRESETS_SEC]).toEqual([30, 300, 3600, 12 * 3600]);
    expect(HIGHLIGHT_DURATION_PRESET_LABELS[30]).toBe('30 sec');
    expect(HIGHLIGHT_DURATION_PRESET_LABELS[300]).toBe('5 min');
    expect(HIGHLIGHT_DURATION_PRESET_LABELS[3600]).toBe('1 hour');
    expect(HIGHLIGHT_DURATION_PRESET_LABELS[12 * 3600]).toBe('12 hr');
    expect(HIGHLIGHT_FREENET_DEFAULT_SECONDS).toBe(300);
  });

  it('each preset maps to the matching seconds and expiresAt ms', () => {
    const now = Date.parse('2026-09-13T10:00:00.000Z');
    const expectedMs: Record<number, number> = {
      30: 30_000,
      300: 300_000,
      3600: 3_600_000,
      [12 * 3600]: 43_200_000,
    };
    for (const sec of HIGHLIGHT_DURATION_PRESETS_SEC) {
      const doc = buildMapHighlight({
        geojson: { type: 'Point', coordinates: [115, -34] },
        createdBy: 'u1',
        displayName: 'Alex',
        durationSeconds: sec,
        nowMs: now,
      });
      expect(Date.parse(doc.expiresAt) - now).toBe(expectedMs[sec]);
      expect(
        resolveHighlightDurationSeconds({
          role: 'farmer',
          farmDefaultSeconds: 30,
          chosenSeconds: sec,
        })
      ).toBe(sec);
    }
  });

  it('custom 400 hours is accepted; 401 is rejected or clamped; 0 is rejected', () => {
    expect(parseHighlightCustomHours(400)).toBe(400);
    expect(parseHighlightCustomHours('400')).toBe(400);
    expect(highlightCustomHoursToSeconds(400)).toBe(HIGHLIGHT_MAX_SECONDS);
    expect(HIGHLIGHT_MAX_SECONDS).toBe(HIGHLIGHT_CUSTOM_HOURS_MAX * 3600);

    const now = Date.parse('2026-09-13T10:00:00.000Z');
    const fourHundred = buildMapHighlight({
      geojson: { type: 'Point', coordinates: [115, -34] },
      createdBy: 'u1',
      displayName: 'Alex',
      durationSeconds: HIGHLIGHT_MAX_SECONDS,
      nowMs: now,
    });
    expect(Date.parse(fourHundred.expiresAt) - now).toBe(HIGHLIGHT_MAX_SECONDS * 1000);

    expect(parseHighlightCustomHours(401)).toBeNull();
    expect(parseHighlightCustomHours('401')).toBeNull();
    expect(highlightCustomHoursToSeconds(401)).toBeNull();
    expect(
      resolveHighlightDurationSeconds({
        role: 'admin',
        farmDefaultSeconds: 30,
        chosenSeconds: 401 * 3600,
      })
    ).toBe(HIGHLIGHT_MAX_SECONDS);

    expect(parseHighlightCustomHours(0)).toBeNull();
    expect(parseHighlightCustomHours('0')).toBeNull();
    expect(highlightCustomHoursToSeconds(0)).toBeNull();
    expect(parseHighlightCustomHours(0.05)).toBeNull();
    expect(parseHighlightCustomHours(HIGHLIGHT_CUSTOM_HOURS_MAX + 0.1)).toBeNull();
    expect(parseHighlightCustomHours(0.1)).toBe(0.1);
    expect(highlightCustomHoursToSeconds(0.1)).toBe(HIGHLIGHT_MIN_CUSTOM_SECONDS);
    expect(highlightCustomHoursToSeconds(1.5)).toBe(5400);
  });
});

describe('breadTrails', () => {
  it('prunes points older than 2 minutes', () => {
    const now = 1_000_000;
    const trail = appendTrailPoint(
      [
        { lat: 1, lng: 2, t: now - TRAIL_WINDOW_MS - 1 },
        { lat: 1.1, lng: 2.1, t: now - 10_000 },
      ],
      1.2,
      2.2,
      now
    );
    expect(trail.every((p) => now - p.t <= TRAIL_WINDOW_MS)).toBe(true);
    expect(pruneTrail(trail, now).length).toBeGreaterThanOrEqual(2);
  });

  it('opacity fades toward transparent at window end', () => {
    expect(trailOpacityAt(0)).toBeGreaterThan(0.5);
    expect(trailOpacityAt(TRAIL_WINDOW_MS)).toBe(0);
  });

  it('vehicle stub and everyone gate', () => {
    expect(isVehiclePresence({ kind: 'vehicle' })).toBe(true);
    expect(isVehiclePresence({ speedMps: 5 })).toBe(true);
    expect(isVehiclePresence({ speedMps: 1 })).toBe(false);
    expect(canEnableEveryoneTrails('admin')).toBe(true);
    expect(canEnableEveryoneTrails('farmer')).toBe(false);
    expect(canEnableEveryoneTrails('viewer')).toBe(false);
  });
});
