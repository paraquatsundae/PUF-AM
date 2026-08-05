/**
 * The APK must not offer a Connect button with nothing on the other end.
 *
 * Android cannot host a Freenet node — the peer is a native Rust binary PUF-AM
 * has no way to spawn there — so the tablet's only honest answers are "a hub
 * holds the node" or "not on this device yet". Getting this wrong is worse than
 * hiding the feature: an operator in a paddock would read a timeout as a network
 * fault and go looking for signal. Plan: `Plans/APK_FREENET_PLUGIN.md`.
 */

import { describe, expect, it } from 'vitest';

import { canReachFreenetNode, freenetRuntimeFor } from '../src/lib/freenetRuntime.ts';

describe('freenetRuntimeFor', () => {
  it('gives the Electron shell its own bundled node', () => {
    expect(freenetRuntimeFor({ desktop: true, native: false, hubConfigured: false })).toBe(
      'desktop-host',
    );
  });

  it('keeps the desktop answer even if a hub base is also configured', () => {
    expect(freenetRuntimeFor({ desktop: true, native: false, hubConfigured: true })).toBe(
      'desktop-host',
    );
  });

  it('routes a browser at its Express, same-origin or workshop sidecar', () => {
    expect(freenetRuntimeFor({ desktop: false, native: false, hubConfigured: false })).toBe(
      'browser-sidecar',
    );
  });

  it('lets an APK use a hub only when one was actually named', () => {
    expect(freenetRuntimeFor({ desktop: false, native: true, hubConfigured: true })).toBe(
      'android-hub',
    );
    expect(freenetRuntimeFor({ desktop: false, native: true, hubConfigured: false })).toBe(
      'android-no-host',
    );
  });
});

describe('canReachFreenetNode', () => {
  it('blocks only the APK that has no node anywhere', () => {
    expect(canReachFreenetNode('desktop-host')).toBe(true);
    expect(canReachFreenetNode('browser-sidecar')).toBe(true);
    expect(canReachFreenetNode('android-hub')).toBe(true);
    expect(canReachFreenetNode('android-no-host')).toBe(false);
  });
});
