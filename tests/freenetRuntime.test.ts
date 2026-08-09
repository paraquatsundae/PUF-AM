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

import {
  canReachFreenetNode,
  freenetIsReadOnlyHere,
  freenetReadsLocally,
  freenetRuntimeFor,
  shouldPollHubPeerStatus,
} from '../src/lib/freenetRuntime.ts';

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

  it('prefers a node on the tablet itself over one across the shed', () => {
    expect(
      freenetRuntimeFor({ desktop: false, native: true, hubConfigured: true, localNode: true }),
    ).toBe('android-local-node');
    expect(
      freenetRuntimeFor({ desktop: false, native: true, hubConfigured: false, localNode: true }),
    ).toBe('android-local-node');
  });

  /**
   * The Electron shell already owns a node and the browser already has an
   * Express in front of one; finding the same node a second way would only make
   * two answers to a question that has one.
   */
  it('leaves the shells that already have a node alone', () => {
    expect(
      freenetRuntimeFor({ desktop: true, native: false, hubConfigured: false, localNode: true }),
    ).toBe('desktop-host');
    expect(
      freenetRuntimeFor({ desktop: false, native: false, hubConfigured: false, localNode: true }),
    ).toBe('browser-sidecar');
  });
});

describe('canReachFreenetNode', () => {
  it('blocks only the APK that has no node anywhere', () => {
    expect(canReachFreenetNode('desktop-host')).toBe(true);
    expect(canReachFreenetNode('browser-sidecar')).toBe(true);
    expect(canReachFreenetNode('android-local-node')).toBe(true);
    expect(canReachFreenetNode('android-hub')).toBe(true);
    expect(canReachFreenetNode('android-no-host')).toBe(false);
  });
});

describe('freenetReadsLocally', () => {
  it('is the one runtime whose GETs never leave the device', () => {
    expect(freenetReadsLocally('android-local-node')).toBe(true);
    expect(freenetReadsLocally('android-hub')).toBe(false);
    expect(freenetReadsLocally('desktop-host')).toBe(false);
  });
});

/**
 * GET works from any client on 0.2; PUT still goes through `fdev`, which is a
 * laptop binary. A tablet beside a node app therefore joins farms it cannot send,
 * and the UI has to disable sending rather than let it fail at the last step.
 */
describe('freenetIsReadOnlyHere', () => {
  it('holds sending back on a tablet whose only node is the local one', () => {
    expect(freenetIsReadOnlyHere('android-local-node', false)).toBe(true);
  });

  it('lifts as soon as a hub is paired, because that laptop has fdev', () => {
    expect(freenetIsReadOnlyHere('android-local-node', true)).toBe(false);
  });

  it('says nothing about runtimes that were never read-only', () => {
    expect(freenetIsReadOnlyHere('android-hub', true)).toBe(false);
    expect(freenetIsReadOnlyHere('android-no-host', false)).toBe(false);
    expect(freenetIsReadOnlyHere('desktop-host', false)).toBe(false);
  });
});

/**
 * A tablet holding a remembered hub reports `android-hub` at first paint, because
 * the loopback probe has not answered yet. Acting on that reading cost a real
 * `peer/status` at a laptop the join never needed — seen in logcat against
 * `192.168.1.205:3000` while the tablet's own node was up and about to be found.
 */
describe('shouldPollHubPeerStatus', () => {
  it('waits for the probe rather than trusting a remembered hub', () => {
    expect(shouldPollHubPeerStatus({ runtime: 'android-hub', settled: false })).toBe(false);
    expect(shouldPollHubPeerStatus({ runtime: 'android-hub', settled: true })).toBe(true);
  });

  it('never asks a hub once the node turns out to be on this device', () => {
    expect(shouldPollHubPeerStatus({ runtime: 'android-local-node', settled: true })).toBe(false);
  });

  it('has nothing to ask when there is no node anywhere', () => {
    expect(shouldPollHubPeerStatus({ runtime: 'android-no-host', settled: true })).toBe(false);
  });

  it('leaves the shells that own a node polling as they always did', () => {
    expect(shouldPollHubPeerStatus({ runtime: 'desktop-host', settled: true })).toBe(true);
    expect(shouldPollHubPeerStatus({ runtime: 'browser-sidecar', settled: true })).toBe(true);
  });
});
