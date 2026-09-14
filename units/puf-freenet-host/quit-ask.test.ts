import { describe, expect, it } from 'vitest';

import type { FreenetHostMode } from './src/types.ts';
import {
  FREENET_ATTACHED_LEAVE_BODY,
  FREENET_QUIT_ASK_TITLE,
  FREENET_QUIT_KEEP_LABEL,
  FREENET_QUIT_STOP_LABEL,
  freenetQuitAskKind,
  quitStopsManagedFreenet,
  shouldOfferStopFreenet,
} from './src/quit-ask.ts';

const MODES: FreenetHostMode[] = ['stopped', 'starting', 'managed', 'attached', 'failed'];

describe('freenet quit ask', () => {
  it('asks Keep / Stop only for a node this bake started', () => {
    expect(freenetQuitAskKind('managed')).toBe('managed');
    expect(freenetQuitAskKind('starting')).toBe('managed');
    expect(shouldOfferStopFreenet('managed')).toBe(true);
    expect(shouldOfferStopFreenet('starting')).toBe(true);
  });

  it('never offers Stop for an attached third-party node', () => {
    expect(freenetQuitAskKind('attached')).toBe('attached');
    expect(shouldOfferStopFreenet('attached')).toBe(false);
    expect(quitStopsManagedFreenet('attached', 'stop')).toBe(false);
    expect(FREENET_ATTACHED_LEAVE_BODY).toMatch(/another Freenet/i);
  });

  it('skips the ask when nothing is ours to keep or stop', () => {
    expect(freenetQuitAskKind('stopped')).toBe('none');
    expect(freenetQuitAskKind('failed')).toBe('none');
    expect(freenetQuitAskKind(null)).toBe('none');
    expect(shouldOfferStopFreenet('stopped')).toBe(false);
  });

  it('Stop only kills managed; Keep and every other mode leave the node', () => {
    expect(quitStopsManagedFreenet('managed', 'stop')).toBe(true);
    expect(quitStopsManagedFreenet('starting', 'stop')).toBe(true);
    expect(quitStopsManagedFreenet('managed', 'keep')).toBe(false);
    for (const mode of MODES) {
      expect(quitStopsManagedFreenet(mode, 'keep')).toBe(false);
    }
    expect(quitStopsManagedFreenet('attached', 'stop')).toBe(false);
    expect(quitStopsManagedFreenet('stopped', 'stop')).toBe(false);
    expect(quitStopsManagedFreenet('failed', 'stop')).toBe(false);
  });

  it('names the quit question Keep running (default) vs Stop Freenet', () => {
    expect(FREENET_QUIT_ASK_TITLE).toBe('Freenet is still running on this computer');
    expect(FREENET_QUIT_KEEP_LABEL).toBe('Keep running');
    expect(FREENET_QUIT_STOP_LABEL).toBe('Stop Freenet');
  });
});
