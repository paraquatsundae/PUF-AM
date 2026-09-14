/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mintInviteToken } from '../../../units/mist-freenet/src/invite-token.ts';
import { FREENET_JOIN_CONNECTING_LABEL } from '../../../src/lib/freenetJoinWait.ts';

vi.mock('./freenetLoginPrewarm.ts', () => ({
  prewarmFreenetHost: async () => undefined,
}));

vi.mock('../../../src/lib/deviceSession', () => ({
  getLastDisplayName: () => 'Pat',
}));

vi.mock('../../../src/hooks/useFreenetJoinWait.ts', () => ({
  useFreenetJoinWait: () => ({
    view: {
      phase: 'connecting',
      tone: 'wait',
      label: 'Connecting to peers — Listening until this node is On Opennet.',
      detail: 'The node is coming up. Opennet can take a few minutes.',
      peerCount: 0,
      leftover: null,
    },
    waitUntilOpennet: vi.fn(),
  }),
}));

import FreenetLoginJoin from './FreenetLoginJoin';

afterEach(cleanup);

describe('FreenetLoginJoin — Opennet wait', () => {
  it('shows connecting, not a red connect-to-Freenet error, once a crew invite is identified', () => {
    const invite = mintInviteToken();
    const { container } = render(
      <FreenetLoginJoin code={invite} kind="join-ticket" availability="host" onBack={() => undefined} />,
    );
    const box = screen.getByTestId('freenet-join-wait');
    expect(box.getAttribute('data-tone')).toBe('wait');
    expect(box.textContent).toContain(FREENET_JOIN_CONNECTING_LABEL);
    expect(container.querySelector('.bg-rose-50')).toBeNull();
    expect(screen.getByRole('button', { name: /join this farm/i })).toBeTruthy();
  });
});
