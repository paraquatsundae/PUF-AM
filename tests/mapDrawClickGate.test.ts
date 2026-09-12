import { beforeEach, describe, expect, it } from 'vitest';
import {
  armSkipSyntheticMouse,
  consumeSkipSyntheticMouse,
  markDrawUiIgnore,
  prepareDrawHandlerAfterMapGesture,
  resetDrawClickGate,
  shouldAcceptDrawVertexAfterMapMove,
  SYNTHETIC_MOUSE_SKIP_MS,
} from '../src/lib/mapDrawClickGate';

describe('mapDrawClickGate', () => {
  beforeEach(() => {
    resetDrawClickGate();
  });

  it('clears sticky leaflet-draw flags after a map gesture', () => {
    const handler = {
      _pufomPanning: true,
      _clickHandled: true,
      _touchHandled: true,
      _mouseDownOrigin: { x: 1 },
      _disableMarkers: true,
    };
    const now = 1_000_000;
    prepareDrawHandlerAfterMapGesture(handler, now);
    expect(handler._pufomPanning).toBe(false);
    expect(handler._clickHandled).toBeNull();
    expect(handler._touchHandled).toBeNull();
    expect(handler._mouseDownOrigin).toBeNull();
    expect(handler._disableMarkers).toBe(false);
    expect(shouldAcceptDrawVertexAfterMapMove(handler, now)).toBe(true);
  });

  it('skips one synthesized mouse click after move, then accepts the next', () => {
    const now = 2_000_000;
    prepareDrawHandlerAfterMapGesture({}, now);
    expect(consumeSkipSyntheticMouse(now + 10)).toBe(true);
    expect(consumeSkipSyntheticMouse(now + 20)).toBe(false);
  });

  it('does not skip a mouse event after the ghost-click window', () => {
    const now = 3_000_000;
    armSkipSyntheticMouse(now);
    expect(consumeSkipSyntheticMouse(now + SYNTHETIC_MOUSE_SKIP_MS + 1)).toBe(false);
  });

  it('draw-UI ignore still blocks a vertex after a gesture', () => {
    const now = 4_000_000;
    prepareDrawHandlerAfterMapGesture({}, now);
    markDrawUiIgnore(now, 600);
    expect(shouldAcceptDrawVertexAfterMapMove({}, now + 100)).toBe(false);
    expect(shouldAcceptDrawVertexAfterMapMove({}, now + 601)).toBe(true);
  });
});
