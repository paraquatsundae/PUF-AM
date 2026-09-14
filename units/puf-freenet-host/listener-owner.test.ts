import { describe, expect, it } from 'vitest';

import {
  attachKindFromListener,
  classifyFreenetListener,
  decidePortTakenMode,
  type FreenetListenerOwner,
} from './src/listener-owner.ts';

const HOME = '/home/george';
const BUNDLED = '/tmp/.mount_PUF-AMgzqCUl/resources/freenet/freenet';
const OTHER_MOUNT = '/tmp/.mount_PUF-AMoldxxxx/resources/freenet/freenet';
const CONFIG = '/home/george/.config/PUF-AM/freenet/config';

function owner(over: FreenetListenerOwner): FreenetListenerOwner {
  return over;
}

describe('classifyFreenetListener', () => {
  it('treats our child pid as ours', () => {
    expect(
      classifyFreenetListener({
        owner: owner({ pid: 99, exe: '/usr/bin/freenet' }),
        ourChildPid: 99,
        bundledPath: BUNDLED,
      }),
    ).toBe('ours');
  });

  it('treats the same-uid bundled path as ours', () => {
    expect(
      classifyFreenetListener({
        owner: owner({ pid: 7, uid: 1000, exe: BUNDLED, cmdline: `${BUNDLED} network --config-dir ${CONFIG}` }),
        bundledPath: BUNDLED,
        ourUid: 1000,
        homeDir: HOME,
        configDir: CONFIG,
      }),
    ).toBe('ours');
  });

  it('names another AppImage mount as other-appimage', () => {
    expect(
      classifyFreenetListener({
        owner: owner({
          pid: 8,
          uid: 1000,
          exe: OTHER_MOUNT,
          cmdline: `${OTHER_MOUNT} network --config-dir ${CONFIG}`,
        }),
        bundledPath: BUNDLED,
        ourUid: 1000,
        homeDir: HOME,
        configDir: CONFIG,
      }),
    ).toBe('other-appimage');
  });

  it('does not treat PATH ~/.local/bin/freenet as our bundled binary', () => {
    expect(
      classifyFreenetListener({
        owner: owner({
          pid: 1484,
          uid: 1000,
          exe: `${HOME}/.local/bin/freenet`,
          cwd: HOME,
          cmdline: `${HOME}/.local/bin/freenet network`,
        }),
        bundledPath: `${HOME}/.local/bin/freenet`,
        ourUid: 1000,
        homeDir: HOME,
        configDir: CONFIG,
      }),
    ).toBe('login-leftover');
  });

  it('names ~/.local/bin/freenet as a login leftover', () => {
    expect(
      classifyFreenetListener({
        owner: owner({
          pid: 1484,
          uid: 1000,
          exe: `${HOME}/.local/bin/freenet`,
          cwd: HOME,
          cmdline: `${HOME}/.local/bin/freenet network`,
        }),
        bundledPath: BUNDLED,
        ourUid: 1000,
        homeDir: HOME,
        configDir: CONFIG,
      }),
    ).toBe('login-leftover');
  });

  it('names ~/.local/share/freenet cwd as a login leftover', () => {
    expect(
      classifyFreenetListener({
        owner: owner({
          pid: 3,
          uid: 1000,
          exe: '/usr/local/bin/freenet',
          cwd: `${HOME}/.local/share/freenet`,
          cmdline: 'freenet network',
        }),
        bundledPath: BUNDLED,
        ourUid: 1000,
        homeDir: HOME,
      }),
    ).toBe('login-leftover');
  });

  it('does not call a login leftover ours just because the port answers', () => {
    expect(
      classifyFreenetListener({
        owner: owner({
          pid: 1484,
          uid: 1000,
          exe: `${HOME}/.local/bin/freenet`,
          cmdline: `${HOME}/.local/bin/freenet network`,
        }),
        bundledPath: BUNDLED,
        ourUid: 1000,
        homeDir: HOME,
      }),
    ).toBe('login-leftover');
  });
});

describe('decidePortTakenMode', () => {
  it('keeps managed when we spawned or the listener is ours', () => {
    expect(
      decidePortTakenMode({
        listenerKind: 'login-leftover',
        hasChild: true,
        recordedManaged: false,
        attachIfRunning: true,
      }),
    ).toBe('managed');
    expect(
      decidePortTakenMode({
        listenerKind: 'ours',
        hasChild: false,
        recordedManaged: false,
        attachIfRunning: true,
      }),
    ).toBe('managed');
    expect(
      decidePortTakenMode({
        listenerKind: 'unknown',
        hasChild: false,
        recordedManaged: true,
        attachIfRunning: true,
      }),
    ).toBe('managed');
  });

  it('attaches only when we did not start the listener', () => {
    expect(
      decidePortTakenMode({
        listenerKind: 'login-leftover',
        hasChild: false,
        recordedManaged: false,
        attachIfRunning: true,
      }),
    ).toBe('attached');
    expect(
      decidePortTakenMode({
        listenerKind: 'other-appimage',
        hasChild: false,
        recordedManaged: false,
        attachIfRunning: true,
      }),
    ).toBe('attached');
  });
});

describe('attachKindFromListener', () => {
  it('maps unknown to foreign — not older-AppImage', () => {
    expect(attachKindFromListener('unknown')).toBe('foreign');
    expect(attachKindFromListener('ours')).toBe('foreign');
    expect(attachKindFromListener('login-leftover')).toBe('login-leftover');
    expect(attachKindFromListener('other-appimage')).toBe('other-appimage');
  });
});
