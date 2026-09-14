/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { createFreenetContractTrafficEvent } from '../src/lib/freenetContractTraffic';
import { FreenetPeerRing } from '../src/components/FreenetPeerRing';
import { FreenetStatusPanel } from '../src/components/FreenetStatusCard';
import {
  FREENET_BROWSER_ONLY_COPY,
  FREENET_LOG_JOINING_COPY,
  layoutFreenetRing,
} from '../src/lib/freenetRingStatus';
import { hiddenFreenetRingView, type FreenetRingView } from '../src/hooks/useFreenetRingStatus';

afterEach(cleanup);

function view(over: Partial<FreenetRingView>): FreenetRingView {
  return {
    visible: true,
    status: 'listening',
    label: 'Listening.',
    detail: FREENET_LOG_JOINING_COPY,
    caption: FREENET_LOG_JOINING_COPY,
    dots: layoutFreenetRing({ peers: [], peerCount: 0 }).dots,
    placement: 'empty',
    peerCount: 0,
    showRing: true,
    hostMode: null,
    leftover: null,
    traffic: [],
    ...over,
  };
}

describe('FreenetPeerRing', () => {
  it('renders this node and no peer dots when there are 0 peers', () => {
    const layout = layoutFreenetRing({ peers: [], peerCount: 0 });
    const { getByTestId, queryAllByTestId } = render(
      <FreenetPeerRing dots={layout.dots} placement={layout.placement} peerCount={0} />,
    );
    expect(getByTestId('freenet-peer-ring').getAttribute('data-peer-count')).toBe('0');
    expect(getByTestId('freenet-ring-self')).toBeTruthy();
    expect(queryAllByTestId('freenet-ring-peer')).toHaveLength(0);
  });

  it('renders N peer dots plus this node', () => {
    const layout = layoutFreenetRing({ peers: [], peerCount: 5 });
    const { queryAllByTestId } = render(
      <FreenetPeerRing dots={layout.dots} placement={layout.placement} peerCount={5} />,
    );
    expect(queryAllByTestId('freenet-ring-self')).toHaveLength(1);
    expect(queryAllByTestId('freenet-ring-peer')).toHaveLength(5);
  });

  it('idle ring has no fake traffic arcs', () => {
    const layout = layoutFreenetRing({ peers: [], peerCount: 4 });
    const { queryAllByTestId, getByTestId } = render(
      <FreenetPeerRing dots={layout.dots} placement={layout.placement} peerCount={4} />,
    );
    expect(getByTestId('freenet-peer-ring').getAttribute('data-traffic-count')).toBe('0');
    expect(queryAllByTestId('freenet-ring-traffic')).toHaveLength(0);
  });

  it('pulses this node → ring for a host PUT (no invented hop)', () => {
    const layout = layoutFreenetRing({ peers: [], peerCount: 4 });
    const event = createFreenetContractTrafficEvent({
      op: 'put',
      source: 'host',
      slotKind: 'hot',
      at: Date.now(),
    });
    const { getByTestId } = render(
      <FreenetPeerRing
        dots={layout.dots}
        placement={layout.placement}
        peerCount={4}
        traffic={[event]}
      />,
    );
    const flash = getByTestId('freenet-ring-traffic');
    expect(flash.getAttribute('data-direction')).toBe('out');
    expect(flash.getAttribute('data-target')).toBe('ring');
    expect(getByTestId('freenet-ring-traffic-label').textContent).toBe('Sent Hot');
  });
});

describe('FreenetStatusPanel', () => {
  it('renders nothing without Freenet', () => {
    const { queryByTestId } = render(<FreenetStatusPanel view={hiddenFreenetRingView()} />);
    expect(queryByTestId('freenet-status-section')).toBeNull();
  });

  it('shows status and an empty ring when the host is up', () => {
    const { getByTestId } = render(<FreenetStatusPanel view={view({})} />);
    expect(getByTestId('freenet-status-section')).toBeTruthy();
    expect(getByTestId('freenet-status-label').textContent).toBe('Listening.');
    expect(getByTestId('freenet-peer-ring').getAttribute('data-peer-count')).toBe('0');
    expect(getByTestId('freenet-ring-caption').textContent).toBe(FREENET_LOG_JOINING_COPY);
  });

  it('shows N peers on the ring', () => {
    const layout = layoutFreenetRing({ peers: [], peerCount: 4 });
    const { queryAllByTestId } = render(
      <FreenetStatusPanel
        view={view({
          status: 'opennet',
          label: 'On Opennet',
          caption: '4 peers (positions not reported by this node).',
          dots: layout.dots,
          placement: 'count',
          peerCount: 4,
        })}
      />,
    );
    expect(queryAllByTestId('freenet-ring-peer')).toHaveLength(4);
  });

  it('shows the browser line and no ring on hosted web', () => {
    const { getByTestId, queryByTestId } = render(
      <FreenetStatusPanel
        view={view({
          status: 'browser',
          label: FREENET_BROWSER_ONLY_COPY,
          detail: '',
          showRing: false,
        })}
      />,
    );
    expect(getByTestId('freenet-status-label').textContent).toBe(FREENET_BROWSER_ONLY_COPY);
    expect(queryByTestId('freenet-peer-ring')).toBeNull();
  });

  it('shows the kill switch when the host only attached', () => {
    const { getByTestId } = render(
      <FreenetStatusPanel view={view({ hostMode: 'attached' })} onStop={() => undefined} />,
    );
    expect(getByTestId('freenet-stop-managed').textContent).toMatch(/Stop Freenet on this device/);
    expect(getByTestId('freenet-attached-leave').textContent).toMatch(/will not stop their app/i);
  });

  it('shows Stop Freenet when this bake spawned the node', () => {
    const { getByTestId, queryByTestId } = render(
      <FreenetStatusPanel view={view({ hostMode: 'managed' })} onStop={() => undefined} />,
    );
    expect(getByTestId('freenet-stop-managed').textContent).toMatch(/Stop Freenet on this device/);
    expect(queryByTestId('freenet-attached-leave')).toBeNull();
  });

  it('shows Start Freenet when the node is stopped', () => {
    const { getByTestId } = render(
      <FreenetStatusPanel
        view={view({ hostMode: 'stopped' })}
        holdOff
        onStop={() => undefined}
        onStart={() => undefined}
      />,
    );
    expect(getByTestId('freenet-start-device').textContent).toMatch(/Start Freenet/);
    expect(getByTestId('freenet-stop-managed').textContent).toMatch(/Stop Freenet on this device/);
  });

  it('does not claim Freenet Android Node was killed', () => {
    const { getByTestId } = render(
      <FreenetStatusPanel
        view={view({ hostMode: 'attached', leftover: 'android-node' })}
        onStop={() => undefined}
        onOpenAndroidNode={() => undefined}
        kill={{
          hostId: 'h',
          mode: 'attached',
          reachable: true,
          wsUrl: 'ws://127.0.0.1:7509',
          wsHost: '127.0.0.1',
          wsPort: 7509,
          configDir: '',
          dataDir: '',
          logDir: '',
          updateRequired: false,
          leftover: 'android-node',
          leftoverPackage: 'org.freenet.androidnode',
          portFree: false,
          stoppedOurs: true,
        }}
      />,
    );
    expect(getByTestId('freenet-kill-result').textContent).toMatch(/cannot force-stop/i);
    expect(getByTestId('freenet-kill-result').textContent).not.toMatch(/we stopped Freenet Android Node/i);
    expect(getByTestId('freenet-open-android-node')).toBeTruthy();
  });
});
