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
  HIGHLIGHT_DEFAULT_SECONDS,
  isHighlightActive,
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
