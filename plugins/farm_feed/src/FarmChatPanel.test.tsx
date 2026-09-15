/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { FarmChatMessage } from './farmChatLog';

const messages: FarmChatMessage[] = [
  {
    id: '1',
    at: '2026-09-15T06:00:00.000Z',
    authorName: 'Sam',
    text: 'Sprayer is down, use the ute. Extra wrap so the five-line stack needs a scrollport.',
  },
  {
    id: '2',
    at: '2026-09-15T06:01:00.000Z',
    authorName: 'Dave',
    text: 'Copy.',
  },
  {
    id: '3',
    at: '2026-09-15T06:02:00.000Z',
    authorName: 'Sam',
    text: 'Also check the north gate.',
  },
  {
    id: '4',
    at: '2026-09-15T06:03:00.000Z',
    authorName: 'Lee',
    text: 'On it.',
  },
  {
    id: '5',
    at: '2026-09-15T06:04:00.000Z',
    authorName: 'Sam',
    text: 'Thanks.',
  },
];

vi.mock('./useFarmChat', () => ({
  useFarmChat: () => ({
    active: true,
    messages,
    sending: false,
    error: null,
    canCompose: true,
    hosted: false,
    freenet: true,
    canPublishFreenet: true,
    send: async () => true,
  }),
}));

import { FarmChatPanel } from './FarmChatPanel';

afterEach(cleanup);

describe('FarmChatPanel', () => {
  it('gives the live log a bounded scrollport', () => {
    render(<FarmChatPanel />);
    const log = screen.getByTestId('farm-chat-log');
    expect(log.className).toMatch(/overflow-y-auto/);
    expect(log.className).toMatch(/min-h-\[9rem\]/);
    expect(log.className).toMatch(/max-h-\[14rem\]/);
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });
});
