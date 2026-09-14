import { describe, expect, it } from 'vitest';

import {
  FREENET_CREW_CANNOT_SEND,
  FREENET_DESKTOP_STARTING_LABEL,
  FREENET_NO_HOST_DETAIL,
  FREENET_NO_HOST_LABEL,
  FREENET_STARTING_LABEL,
} from '../../../src/lib/freenetRuntime.ts';
import {
  describeFreenetSyncReadiness,
  freenetSendBlockedTitle,
} from './freenetSyncReadiness.ts';

describe('describeFreenetSyncReadiness', () => {
  it('does not send a Freenet tablet to pair a hub while the in-APK node can start', () => {
    const readiness = describeFreenetSyncReadiness({
      peer: null,
      host: null,
      onDesktop: false,
      runtime: 'android-no-host',
      lookingForHub: true,
      canStartOwnNode: true,
    });
    expect(readiness.label).toBe(FREENET_STARTING_LABEL);
    expect(readiness.label).not.toMatch(/laptop/i);
  });

  it('does not send an AppImage operator to pair a hub while the bundled node starts', () => {
    const readiness = describeFreenetSyncReadiness({
      peer: null,
      host: null,
      onDesktop: true,
      runtime: 'desktop-host',
      lookingForHub: false,
    });
    expect(readiness.label).toBe(FREENET_DESKTOP_STARTING_LABEL);
    expect(readiness.label).not.toMatch(/laptop|hub|pair/i);
  });

  it('is ready when the local node answers', () => {
    const readiness = describeFreenetSyncReadiness({
      peer: null,
      host: null,
      onDesktop: false,
      runtime: 'android-local-node',
      lookingForHub: false,
    });
    expect(readiness.ready).toBe(true);
  });
});

describe('freenetSendBlockedTitle', () => {
  it('tells crew they cannot Send — hub pairing is the wrong fix', () => {
    expect(freenetSendBlockedTitle({ canSend: false, hasNode: true, readOnly: false })).toBe(
      FREENET_CREW_CANNOT_SEND,
    );
    expect(FREENET_CREW_CANNOT_SEND).toMatch(/does not unlock Send/);
  });

  it('does not require Freenet Android Node or a hub as the only path', () => {
    expect(FREENET_NO_HOST_LABEL).not.toMatch(/Freenet Android Node/);
    expect(FREENET_NO_HOST_DETAIL).toMatch(/not required/);
    expect(FREENET_NO_HOST_DETAIL).not.toMatch(/Scan for hubs/);
  });
});
