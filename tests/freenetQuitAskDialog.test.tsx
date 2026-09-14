/**
 * @vitest-environment jsdom
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FreenetQuitAskDialog } from '../src/components/FreenetQuitAskDialog';
import {
  FREENET_ATTACHED_LEAVE_BODY,
  FREENET_QUIT_ASK_TITLE,
  FREENET_QUIT_KEEP_LABEL,
  FREENET_QUIT_STOP_LABEL,
} from '../units/puf-freenet-host/src/quit-ask.ts';

afterEach(cleanup);

describe('FreenetQuitAskDialog', () => {
  it('asks Keep running vs Stop Freenet for a managed node', () => {
    const { getByTestId } = render(
      <FreenetQuitAskDialog
        kind="managed"
        onKeep={() => undefined}
        onStop={() => undefined}
        onLeaveAttached={() => undefined}
      />,
    );
    expect(getByTestId('freenet-quit-ask').getAttribute('data-kind')).toBe('managed');
    expect(getByTestId('freenet-quit-ask').textContent).toContain(FREENET_QUIT_ASK_TITLE);
    expect(getByTestId('freenet-quit-keep').textContent).toBe(FREENET_QUIT_KEEP_LABEL);
    expect(getByTestId('freenet-quit-stop').textContent).toBe(FREENET_QUIT_STOP_LABEL);
  });

  it('does not offer Stop when this is another Freenet', () => {
    const { getByTestId, queryByTestId } = render(
      <FreenetQuitAskDialog
        kind="attached"
        onKeep={() => undefined}
        onStop={() => undefined}
        onLeaveAttached={() => undefined}
      />,
    );
    expect(getByTestId('freenet-quit-ask').getAttribute('data-kind')).toBe('attached');
    expect(getByTestId('freenet-quit-ask').textContent).toContain(FREENET_ATTACHED_LEAVE_BODY);
    expect(queryByTestId('freenet-quit-stop')).toBeNull();
  });
});
