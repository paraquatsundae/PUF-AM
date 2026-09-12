/**
 * @vitest-environment jsdom
 *
 * Host capability is what the network pack keys off (Plans/FREENET_NETWORK_PACK.md
 * decision 5): a shell either owns a node or it does not. No build flag here.
 */

import { afterEach, describe, expect, it } from 'vitest';

import type { DesktopBridge } from '../src/lib/desktopBridge.ts';
import {
  freenetHostCapabilityFor,
  getFreenetHostCapability,
} from '../src/lib/freenetHostCapability.ts';

afterEach(() => {
  delete window.pufamDesktop;
});

describe('freenetHostCapabilityFor', () => {
  it('is electron on the desktop shell', () => {
    expect(freenetHostCapabilityFor({ desktop: true, native: false })).toBe('electron');
  });

  it('is null on the hosted web', () => {
    expect(freenetHostCapabilityFor({ desktop: false, native: false })).toBe(null);
  });

  it('is android on an APK only when a loopback node has answered', () => {
    expect(freenetHostCapabilityFor({ desktop: false, native: true })).toBe(null);
    expect(freenetHostCapabilityFor({ desktop: false, native: true, androidHost: false })).toBe(
      null,
    );
    expect(freenetHostCapabilityFor({ desktop: false, native: true, androidHost: true })).toBe(
      'android'
    );
  });
});

describe('getFreenetHostCapability', () => {
  it('reads the preload bridge, not a Vite flag', () => {
    expect(getFreenetHostCapability()).toBe(null);
    window.pufamDesktop = {
      isDesktop: true,
      cloudApiBase: '',
      freenetApiBase: '',
      mistEnabled: false,
      platform: 'linux',
      freenet: {} as DesktopBridge['freenet'],
    };
    expect(getFreenetHostCapability()).toBe('electron');
  });
});
