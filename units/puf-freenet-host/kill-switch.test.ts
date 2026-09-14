import { describe, expect, it } from 'vitest';

import {
  FREENET_ANDROID_NODE_PACKAGE,
  FREENET_KILL_ANDROID_NODE_LEFT,
  FREENET_KILL_STOPPED_OURS,
  claimedKilledAndroidNode,
  killSwitchHonestMessage,
  leftoverAfterKillSwitch,
  maySignalAttachedListener,
  shouldConfirmStopUserService,
  shouldOfferKillSwitch,
  shouldOfferStartFreenet,
} from './src/kill-switch.ts';

describe('leftoverAfterKillSwitch', () => {
  it('is none when :7509 is free', () => {
    expect(leftoverAfterKillSwitch({ portStillFreenet: false, listenerKind: 'foreign' })).toBe(
      'none',
    );
  });

  it('names Freenet Android Node from the listen uid packages', () => {
    expect(
      leftoverAfterKillSwitch({
        portStillFreenet: true,
        listenerKind: 'foreign',
        packagesForUid: [FREENET_ANDROID_NODE_PACKAGE],
      }),
    ).toBe('android-node');
  });

  it('names a same-uid AppImage leftover as ours', () => {
    expect(
      leftoverAfterKillSwitch({ portStillFreenet: true, listenerKind: 'other-appimage' }),
    ).toBe('ours');
  });

  it('names a login leftover as the user service', () => {
    expect(
      leftoverAfterKillSwitch({ portStillFreenet: true, listenerKind: 'login-leftover' }),
    ).toBe('login-service');
  });
});

describe('kill-switch copy', () => {
  it('does not claim a third-party node was killed', () => {
    const message = killSwitchHonestMessage({ leftover: 'android-node', stoppedOurs: true });
    expect(message).toBe(FREENET_KILL_ANDROID_NODE_LEFT);
    expect(claimedKilledAndroidNode({ leftover: 'android-node', message })).toBe(false);
    expect(message).toMatch(/cannot force-stop/i);
    expect(message).not.toMatch(/Freenet hub/i);
  });

  it('says the port is free after we stopped ours', () => {
    expect(killSwitchHonestMessage({ leftover: 'none', stoppedOurs: true })).toBe(
      FREENET_KILL_STOPPED_OURS,
    );
  });
});

describe('kill-switch offers', () => {
  it('offers Stop on attached as well as managed', () => {
    expect(shouldOfferKillSwitch('attached')).toBe(true);
    expect(shouldOfferKillSwitch('managed')).toBe(true);
    expect(shouldOfferKillSwitch('stopped')).toBe(true);
  });

  it('offers Start after hold-off or when stopped', () => {
    expect(shouldOfferStartFreenet('managed', true)).toBe(true);
    expect(shouldOfferStartFreenet('stopped', false)).toBe(true);
    expect(shouldOfferStartFreenet('managed', false)).toBe(false);
  });

  it('asks a second confirm only for the user Freenet service', () => {
    expect(shouldConfirmStopUserService('login-service', false)).toBe(true);
    expect(shouldConfirmStopUserService('login-service', true)).toBe(false);
    expect(shouldConfirmStopUserService('android-node', false)).toBe(false);
  });

  it('may signal our leftover AppImage, not a login leftover', () => {
    expect(maySignalAttachedListener('ours')).toBe(true);
    expect(maySignalAttachedListener('other-appimage')).toBe(true);
    expect(maySignalAttachedListener('login-leftover')).toBe(false);
    expect(maySignalAttachedListener('foreign')).toBe(false);
  });
});
