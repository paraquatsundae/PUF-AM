import { describe, expect, it } from 'vitest';

import {
  FREENET_QUIT_BUTTONS,
  FREENET_QUIT_DEFAULT_BUTTON,
  choiceFromQuitResponse,
  shutdownStopsFreenet,
} from './freenetQuitDialog.ts';

describe('desktop Freenet quit dialog', () => {
  it('defaults to Keep running and only Stop kills a managed node', () => {
    expect(FREENET_QUIT_BUTTONS[FREENET_QUIT_DEFAULT_BUTTON]).toBe('Keep running');
    expect(FREENET_QUIT_BUTTONS[1]).toBe('Stop Freenet');
    expect(choiceFromQuitResponse(0)).toBe('keep');
    expect(choiceFromQuitResponse(1)).toBe('stop');
    expect(choiceFromQuitResponse(99)).toBe('keep');
    expect(shutdownStopsFreenet('managed', 1)).toBe(true);
    expect(shutdownStopsFreenet('managed', 0)).toBe(false);
    expect(shutdownStopsFreenet('starting', 1)).toBe(true);
    expect(shutdownStopsFreenet('attached', 1)).toBe(false);
    expect(shutdownStopsFreenet('attached', 0)).toBe(false);
    expect(shutdownStopsFreenet('stopped', 1)).toBe(false);
  });
});
