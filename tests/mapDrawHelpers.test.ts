/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import {
  drawHandlerMarkerCount,
  pointHitsDrawUi,
  shouldIgnoreMapDrawInput,
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

  it('pointHitsDrawUi detects padded control rects', () => {
    document.body.innerHTML = `
      <div class="leaflet-control-zoom" style="position:fixed;left:10px;top:10px;width:40px;height:80px"></div>
    `;
    const el = document.querySelector('.leaflet-control-zoom') as HTMLElement;
    // jsdom getBoundingClientRect is often 0 — stub it
    el.getBoundingClientRect = () =>
      ({
        left: 10,
        top: 10,
        right: 50,
        bottom: 90,
        width: 40,
        height: 80,
        x: 10,
        y: 10,
        toJSON() {},
      }) as DOMRect;

    expect(pointHitsDrawUi(30, 50)).toBe(true);
    expect(pointHitsDrawUi(30, 50, document, 0)).toBe(true);
    // Outside rect but inside default pad (28px)
    expect(pointHitsDrawUi(70, 50)).toBe(true);
    // Far from control
    expect(pointHitsDrawUi(400, 400)).toBe(false);
  });

  it('shouldIgnoreMapDrawInput when handler is panning', () => {
    const handler: LeafletDrawHandler = {
      enable() {},
      disable() {},
      _pufomPanning: true,
    };
    expect(shouldIgnoreMapDrawInput({ target: document.body }, handler)).toBe(true);
  });

  it('shouldIgnoreMapDrawInput when event target is draw UI', () => {
    document.body.innerHTML = `<button class="pufom-draw-actions">Finish</button>`;
    const btn = document.querySelector('button')!;
    expect(shouldIgnoreMapDrawInput({ target: btn, originalEvent: { target: btn } as unknown as Event })).toBe(
      true
    );
  });
});
