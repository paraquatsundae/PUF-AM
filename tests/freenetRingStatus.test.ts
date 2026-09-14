/**
 * @vitest-environment jsdom
 *
 * Settings Freenet section — hide without Freenet; honest status; ring layout.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  FREENET_BROWSER_ONLY_COPY,
  FREENET_LOG_JOINING_COPY,
  freenetOperatorStatus,
  freenetOperatorStatusDetail,
  freenetOperatorStatusLabel,
  freenetRingCaption,
  hostLooksUp,
  layoutFreenetRing,
  shouldShowFreenetStatusSection,
} from '../src/lib/freenetRingStatus';
import { freenetRingViewForTests } from '../src/hooks/useFreenetRingStatus';
import type { FreenetHostStatus } from '../units/puf-freenet-host/src/types.ts';

function host(over: Partial<FreenetHostStatus> = {}): FreenetHostStatus {
  return {
    hostId: 'puf-freenet-host',
    mode: 'stopped',
    reachable: false,
    wsUrl: 'ws://127.0.0.1:7509/v1/contract/command',
    wsHost: '127.0.0.1',
    wsPort: 7509,
    configDir: '',
    dataDir: '',
    logDir: '',
    updateRequired: false,
    ...over,
  };
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('shouldShowFreenetStatusSection', () => {
  it('hides a hosted-only farm with no pack, no session, and no live node', () => {
    expect(
      shouldShowFreenetStatusSection({
        pipe: 'cloud',
        farmNetworkPacks: {},
        hasMistSession: false,
        hostUp: false,
      }),
    ).toBe(false);
  });

  it('shows a Freenet-native farm', () => {
    expect(
      shouldShowFreenetStatusSection({
        pipe: 'freenet',
        hasMistSession: true,
        hostUp: false,
      }),
    ).toBe(true);
  });

  it('shows a hybrid farm when the network pack is on', () => {
    expect(
      shouldShowFreenetStatusSection({
        pipe: 'cloud',
        farmNetworkPacks: {
          freenet_host: {
            enabled: true,
            mistFarmId: 'mist-1',
            changedAt: '2026-09-14T00:00:00.000Z',
            changedBy: 'u1',
          },
        },
        hasMistSession: false,
        hostUp: false,
      }),
    ).toBe(true);
  });

  it('shows when the desktop or APK node is up', () => {
    expect(
      shouldShowFreenetStatusSection({
        pipe: 'cloud',
        hasMistSession: false,
        hostUp: true,
      }),
    ).toBe(true);
  });
});

describe('freenetOperatorStatus', () => {
  it('names starting, listening, Opennet, attached, and failed honestly', () => {
    expect(
      freenetOperatorStatus({ capability: 'electron', host: host({ mode: 'starting' }) }),
    ).toBe('starting');
    expect(
      freenetOperatorStatus({
        capability: 'electron',
        host: host({ mode: 'managed', reachable: true }),
        ring: { peers: [], peerCount: 0, peerSource: 'none' },
      }),
    ).toBe('listening');
    expect(
      freenetOperatorStatus({
        capability: 'android',
        host: host({ mode: 'managed', reachable: true }),
        ring: { peers: [], peerCount: 2, peerSource: 'count' },
      }),
    ).toBe('opennet');
    expect(
      freenetOperatorStatus({
        capability: 'electron',
        host: host({ mode: 'attached', reachable: true }),
        ring: { peers: [], peerCount: 4, peerSource: 'count' },
      }),
    ).toBe('attached');
    expect(
      freenetOperatorStatus({
        capability: 'electron',
        host: host({ mode: 'failed', lastError: 'no binary' }),
      }),
    ).toBe('failed');
  });

  it('does not call an attached Freenet node a Freenet hub or a LAN hub', () => {
    const detail = freenetOperatorStatusDetail({
      status: 'attached',
      host: host({ mode: 'attached', reachable: true }),
      capability: 'android',
      ring: { peers: [], peerCount: 0, peerSource: 'none' },
    });
    expect(detail.toLowerCase()).not.toMatch(/\bfreenet hub\b/);
    expect(detail).toMatch(/not a LAN hub/i);
    expect(detail).toMatch(/this device/i);
    expect(detail).not.toMatch(/tablet/i);
    expect(detail).not.toMatch(/already open/i);
  });

  it('reuses our leftover as managed — no already-open error', () => {
    const ours = host({ mode: 'attached', reachable: true, leftover: 'ours' });
    expect(
      freenetOperatorStatus({
        capability: 'android',
        host: ours,
        ring: { peers: [], peerCount: 0, peerSource: 'none' },
      }),
    ).toBe('listening');
    const detail = freenetOperatorStatusDetail({
      status: 'listening',
      host: ours,
      capability: 'android',
      ring: { peers: [], peerCount: 0, peerSource: 'none' },
    });
    expect(detail).toBe(FREENET_LOG_JOINING_COPY);
    expect(detail).not.toMatch(/already open|already listening|already running/i);
    expect(detail).not.toMatch(/tablet/i);
  });

  it('keeps Freenet Android Node as an honest leftover, not a PUF-AM already-open failure', () => {
    const detail = freenetOperatorStatusDetail({
      status: 'attached',
      host: host({
        mode: 'attached',
        reachable: true,
        leftover: 'android-node',
        leftoverPackage: 'org.freenet.androidnode',
      }),
      capability: 'android',
      ring: { peers: [], peerCount: 0, peerSource: 'none' },
    });
    expect(detail).toMatch(/cannot force-stop/i);
    expect(detail).toMatch(/this device/i);
    expect(detail).not.toMatch(/already open/i);
    expect(detail).not.toMatch(/tablet/i);
    expect(detail).not.toMatch(/Freenet hub/i);
  });

  it('does not call a live bundled node a LAN hub', () => {
    const label = freenetOperatorStatusLabel(
      freenetOperatorStatus({
        capability: 'electron',
        host: host({ mode: 'managed', reachable: true }),
      }),
    );
    expect(label).toBe('Listening.');
    expect(label.toLowerCase()).not.toContain('lan hub');
  });

  it('says On Opennet when the log (or JSON) reports N≥1', () => {
    expect(
      freenetOperatorStatusLabel(
        freenetOperatorStatus({
          capability: 'electron',
          host: host({ mode: 'managed', reachable: true }),
          ring: { peers: [], peerCount: 26, peerSource: 'count' },
        }),
      ),
    ).toBe('On Opennet');
  });

  it('tells hosted web that Freenet is not in the browser', () => {
    expect(freenetOperatorStatus({ capability: null, host: null })).toBe('browser');
    expect(freenetOperatorStatusLabel('browser')).toBe(FREENET_BROWSER_ONLY_COPY);
  });

  it('says attached with 0 peers is still joining Opennet, not a wrong-port stuck state', () => {
    const leftover = host({ mode: 'attached', reachable: true, attachKind: 'login-leftover' });
    expect(
      freenetOperatorStatusDetail({
        status: 'attached',
        host: leftover,
        ring: { peers: [], peerCount: 0, peerSource: 'none' },
      }),
    ).toMatch(/already running on this computer \(not this AppImage\)/i);
    expect(
      freenetOperatorStatusDetail({
        status: 'attached',
        host: leftover,
        ring: { peers: [], peerCount: 0, peerSource: 'none' },
      }),
    ).not.toMatch(/older PUF-AM AppImage/i);
    expect(
      freenetOperatorStatusDetail({
        status: 'listening',
        host: host({ mode: 'managed', reachable: true }),
        ring: { peers: [], peerCount: 0, peerSource: 'none' },
      }),
    ).toBe(FREENET_LOG_JOINING_COPY);
    expect(
      freenetOperatorStatusDetail({
        status: 'listening',
        host: host({ mode: 'managed', reachable: true }),
        ring: { peers: [], peerCount: 0, peerSource: 'unreported' },
      }),
    ).toBe(FREENET_LOG_JOINING_COPY);
    expect(
      freenetOperatorStatusDetail({
        status: 'listening',
        host: host({ mode: 'managed', reachable: true }),
        ring: { peers: [], peerCount: 0, peerSource: 'unreported' },
      }),
    ).not.toMatch(/not connected/i);
    expect(
      freenetOperatorStatusDetail({
        status: 'attached',
        host: leftover,
        ring: { peers: [], peerCount: 2, peerSource: 'count' },
      }),
    ).toMatch(/on Opennet \(2 peers\)/);
  });

  it('uses the older-AppImage line only when the listener is another PUF-AM binary', () => {
    const other = host({ mode: 'attached', reachable: true, attachKind: 'other-appimage' });
    expect(
      freenetOperatorStatusDetail({
        status: 'attached',
        host: other,
        ring: { peers: [], peerCount: 0, peerSource: 'none' },
      }),
    ).toMatch(/older PUF-AM AppImage/i);
    expect(
      freenetOperatorStatusDetail({
        status: 'attached',
        host: host({ mode: 'attached', reachable: true, attachKind: 'foreign' }),
      }),
    ).toMatch(/already running on this computer/i);
    expect(
      freenetOperatorStatusDetail({
        status: 'attached',
        host: host({ mode: 'attached', reachable: true }),
      }),
    ).not.toMatch(/older PUF-AM AppImage/i);
  });
});

describe('hostLooksUp', () => {
  it('is true while starting or reachable', () => {
    expect(hostLooksUp(host({ mode: 'starting' }))).toBe(true);
    expect(hostLooksUp(host({ mode: 'managed', reachable: true }))).toBe(true);
    expect(hostLooksUp(host({ mode: 'stopped' }))).toBe(false);
  });
});

describe('layoutFreenetRing', () => {
  it('renders this node alone when there are no peers', () => {
    const layout = layoutFreenetRing({ peers: [], peerCount: 0 });
    expect(layout.placement).toBe('empty');
    expect(layout.dots).toHaveLength(1);
    expect(layout.dots[0].kind).toBe('self');
  });

  it('spaces N count-only peers without inventing locations', () => {
    const layout = layoutFreenetRing({ peers: [], peerCount: 3 });
    expect(layout.placement).toBe('count');
    expect(layout.dots.filter((d) => d.kind === 'peer')).toHaveLength(3);
    expect(layout.dots.filter((d) => d.kind === 'self')).toHaveLength(1);
    expect(layout.dots.every((d) => d.kind === 'self' || d.location === undefined)).toBe(true);
  });

  it('places peers that have 0–1 locations', () => {
    const layout = layoutFreenetRing({
      selfLocation: 0,
      peers: [{ id: 'a', location: 0.5 }],
      peerCount: 1,
    });
    expect(layout.placement).toBe('locations');
    expect(layout.dots.find((d) => d.kind === 'peer')?.location).toBe(0.5);
  });
});

describe('freenetRingCaption', () => {
  it('says joining when N is 0 or the log has no line yet', () => {
    expect(
      freenetRingCaption({ status: 'listening', placement: 'empty', peerCount: 0 }),
    ).toBe(FREENET_LOG_JOINING_COPY);
    expect(
      freenetRingCaption({
        status: 'listening',
        placement: 'empty',
        peerCount: 0,
        peerSource: 'unreported',
      }),
    ).toBe(FREENET_LOG_JOINING_COPY);
  });
});

describe('freenetRingViewForTests', () => {
  it('hides the section on a hosted-only farm', () => {
    const view = freenetRingViewForTests('cloud-1', {}, null);
    expect(view.visible).toBe(false);
  });

  it('shows the section when the host is up', () => {
    const view = freenetRingViewForTests(
      'cloud-1',
      {},
      host({ mode: 'managed', reachable: true }),
    );
    expect(view.visible).toBe(true);
    expect(view.showRing).toBe(true);
    expect(view.label).toBe('Listening.');
    expect(view.detail).toBe(FREENET_LOG_JOINING_COPY);
    expect(view.caption).toBe(FREENET_LOG_JOINING_COPY);
  });

  it('shows On Opennet and 26 count-only dots when the log reports 26', () => {
    const view = freenetRingViewForTests(
      'mist-1',
      {},
      host({
        mode: 'managed',
        reachable: true,
        nodeRing: { peers: [], peerCount: 26, peerSource: 'count' },
      }),
    );
    expect(view.label).toBe('On Opennet');
    expect(view.peerCount).toBe(26);
    expect(view.placement).toBe('count');
    expect(view.dots.filter((d) => d.kind === 'peer')).toHaveLength(26);
    expect(view.dots.every((d) => d.kind === 'self' || d.location === undefined)).toBe(true);
    expect(view.traffic).toEqual([]);
  });

  it('shows a fading host PUT and stays idle without one', () => {
    const now = Date.parse('2026-09-14T11:00:16.000Z');
    const idle = freenetRingViewForTests(
      'cloud-1',
      {},
      host({ mode: 'managed', reachable: true }),
      [],
      now,
    );
    expect(idle.traffic).toEqual([]);
    const active = freenetRingViewForTests(
      'cloud-1',
      {},
      host({
        mode: 'managed',
        reachable: true,
        contractTraffic: [
          {
            id: 'h-hot',
            at: now,
            op: 'put',
            direction: 'out',
            slotKind: 'hot',
            label: 'Sent Hot',
            source: 'host',
          },
        ],
      }),
      [],
      now,
    );
    expect(active.traffic[0]?.label).toBe('Sent Hot');
  });
});
