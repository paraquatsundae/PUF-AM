import { describe, expect, it } from 'vitest';

import {
  FREENET_PUT_ALREADY_IN_PROGRESS,
  FREENET_PUT_NOT_LISTENING,
  FREENET_PUT_WAIT_OPENNET,
  freenetPutReadyError,
  shouldEnforceFreenetPutReady,
} from './src/put-ready.ts';

describe('shouldEnforceFreenetPutReady', () => {
  it('skips a stopped host with no child (injected-wire tests)', () => {
    expect(
      shouldEnforceFreenetPutReady({ reachable: false, mode: 'stopped', hasChild: false }),
    ).toBe(false);
  });

  it('enforces once the node is ours or reachable', () => {
    expect(
      shouldEnforceFreenetPutReady({ reachable: true, mode: 'stopped', hasChild: false }),
    ).toBe(true);
    expect(
      shouldEnforceFreenetPutReady({ reachable: false, mode: 'managed', hasChild: true }),
    ).toBe(true);
    expect(
      shouldEnforceFreenetPutReady({ reachable: false, mode: 'attached', hasChild: false }),
    ).toBe(true);
  });
});

describe('freenetPutReadyError', () => {
  it('refuses a PUT while the node is down or still joining', () => {
    expect(freenetPutReadyError({ reachable: false, peerCount: 4 })).toBe(FREENET_PUT_NOT_LISTENING);
    expect(freenetPutReadyError({ reachable: true, peerCount: 0 })).toBe(FREENET_PUT_WAIT_OPENNET);
    expect(freenetPutReadyError({ reachable: true })).toBe(FREENET_PUT_WAIT_OPENNET);
  });

  it('allows a PUT once On Opennet', () => {
    expect(freenetPutReadyError({ reachable: true, peerCount: 1 })).toBeNull();
    expect(FREENET_PUT_ALREADY_IN_PROGRESS).toMatch(/do not press Send again/);
  });
});
