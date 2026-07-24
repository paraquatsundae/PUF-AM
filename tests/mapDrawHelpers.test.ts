/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import {
  drawHandlerMarkerCount,
  type LeafletDrawHandler,
} from '../src/lib/mapDrawHelpers';

describe('mapDrawHelpers', () => {
  it('counts markers on a draw handler', () => {
    const empty: LeafletDrawHandler = { enable() {}, disable() {}, _markers: [] };
    const withPts: LeafletDrawHandler = {
      enable() {},
      disable() {},
      _markers: [{}, {}, {}],
    };
    expect(drawHandlerMarkerCount(empty)).toBe(0);
    expect(drawHandlerMarkerCount(withPts)).toBe(3);
    expect(drawHandlerMarkerCount(null)).toBe(0);
  });
});
