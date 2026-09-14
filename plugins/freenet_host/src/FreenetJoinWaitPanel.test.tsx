/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import {
  FREENET_JOIN_CONNECTING_LABEL,
  FREENET_JOIN_TIMEOUT_LABEL,
  initialFreenetJoinWaitView,
  type FreenetJoinWaitView,
} from '../../../src/lib/freenetJoinWait.ts';
import { FreenetJoinWaitPanel } from './FreenetJoinWaitPanel';

afterEach(cleanup);

function wait(over: Partial<FreenetJoinWaitView> = {}): FreenetJoinWaitView {
  return { ...initialFreenetJoinWaitView(), ...over };
}

describe('FreenetJoinWaitPanel', () => {
  it('shows connecting, not a red error, before the first poll', () => {
    const { container } = render(<FreenetJoinWaitPanel wait={initialFreenetJoinWaitView()} />);
    const box = screen.getByTestId('freenet-join-wait');
    expect(box.getAttribute('data-phase')).toBe('connecting');
    expect(box.getAttribute('data-tone')).toBe('wait');
    expect(box.textContent).toContain(FREENET_JOIN_CONNECTING_LABEL);
    expect(container.querySelector('.bg-rose-50')).toBeNull();
    expect(box.textContent).not.toMatch(/needs to connect|could not connect/i);
  });

  it('keeps Listening as wait tone, not rose', () => {
    const { container } = render(
      <FreenetJoinWaitPanel
        wait={wait({
          phase: 'connecting',
          tone: 'wait',
          label: 'Listening. joining / no ring peers in the log yet.',
          detail: 'joining / no ring peers in the log yet.',
        })}
      />,
    );
    expect(screen.getByTestId('freenet-join-wait').getAttribute('data-tone')).toBe('wait');
    expect(container.querySelector('.bg-rose-50')).toBeNull();
  });

  it('uses rose only after timeout', () => {
    const { container } = render(
      <FreenetJoinWaitPanel
        wait={wait({
          phase: 'timeout',
          tone: 'error',
          label: FREENET_JOIN_TIMEOUT_LABEL,
          detail: 'Waited two minutes.',
        })}
      />,
    );
    expect(screen.getByTestId('freenet-join-wait').getAttribute('data-tone')).toBe('error');
    expect(container.querySelector('.bg-rose-50')).not.toBeNull();
  });
});
