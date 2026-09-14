/**
 * Join-box reducer. Plans/LOGIN_JOIN_SINGLE_BOX.md Decision — 2026-09-12.
 */

import { describe, expect, it } from 'vitest';

import { encodeFarmCodeFromBytes } from '../units/mist-freenet/src/farm-code.ts';
import { mintInviteToken } from '../units/mist-freenet/src/invite-token.ts';
import { SHORT_TICKET_REFUSED } from '../src/lib/joinCodeClassifier.ts';
import {
  freenetJoinAvailability,
  initialJoinState,
  joinCodeReducer,
  type FreenetJoinAvailability,
  type JoinCodeState,
} from '../src/lib/joinCodeFlow.ts';

const farmCode = encodeFarmCodeFromBytes(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));

function apply(
  actions: Parameters<typeof joinCodeReducer>[1][],
  availability: FreenetJoinAvailability = 'host',
): JoinCodeState {
  return actions.reduce((s, a) => joinCodeReducer(s, a, availability), initialJoinState());
}

describe('joinCodeReducer', () => {
  it('PIN → cloud-name', () => {
    const s = apply([{ type: 'TYPE', input: 'K7M2N9QX' }, { type: 'CONTINUE' }]);
    expect(s.stage).toBe('cloud-name');
    expect(s.heldTicket).toBeNull();
  });

  it('FarmCode on host → freenet', () => {
    const s = apply([{ type: 'TYPE', input: farmCode }, { type: 'CONTINUE' }], 'host');
    expect(s.stage).toBe('freenet');
  });

  it('FarmCode on reader → freenet', () => {
    const s = apply([{ type: 'TYPE', input: farmCode }, { type: 'CONTINUE' }], 'reader');
    expect(s.stage).toBe('freenet');
  });

  it('FarmCode on none → freenet-unavailable and discards the string', () => {
    const s = apply([{ type: 'TYPE', input: farmCode }, { type: 'CONTINUE' }], 'none');
    expect(s.stage).toBe('freenet-unavailable');
    expect(s.input).toBe('');
    expect(s.heldTicket).toBeNull();
  });

  it('short ticket stays on code and is refused as an unwrap', () => {
    const s = apply([{ type: 'TYPE', input: 'PUF-K7M2-9Q4X' }, { type: 'CONTINUE' }], 'host');
    expect(s.stage).toBe('code');
    expect(s.notice).toBe(SHORT_TICKET_REFUSED);
    expect(s.input).toBe('PUF-K7M2-9Q4X');
  });

  it('crew invite on host → freenet', () => {
    const invite = mintInviteToken();
    const s = apply([{ type: 'TYPE', input: invite }, { type: 'CONTINUE' }], 'host');
    expect(s.stage).toBe('freenet');
    expect(s.classification.normalized).toBe(invite);
    expect(s.notice).toBeNull();
  });

  it('crew invite on hosted web discards and goes to freenet-unavailable', () => {
    const invite = mintInviteToken();
    const s = apply([{ type: 'TYPE', input: invite }, { type: 'CONTINUE' }], 'none');
    expect(s.stage).toBe('freenet-unavailable');
    expect(s.heldTicket).toBeNull();
  });

  it('BACK clears the box', () => {
    const invite = mintInviteToken();
    const s = apply(
      [{ type: 'TYPE', input: invite }, { type: 'CONTINUE' }, { type: 'BACK' }],
      'host',
    );
    expect(s.heldTicket).toBeNull();
    expect(s.notice).toBeNull();
    expect(s.stage).toBe('code');
  });

  it('does not leave the box on a short invite PIN', () => {
    const s = apply([{ type: 'TYPE', input: 'K7M2N9Q' }, { type: 'CONTINUE' }]);
    expect(s.stage).toBe('code');
    expect(s.classification.hint).toMatch(/8 characters/);
  });

  it('does not open Freenet on an invalid FarmCode (empty normalized)', () => {
    const s = apply([{ type: 'TYPE', input: 'mist-fc-3  ABCDE-FGHJK-MNPQR-ST' }, { type: 'CONTINUE' }], 'host');
    expect(s.stage).toBe('code');
    expect(s.classification.normalized).toBe('');
  });
});

describe('freenetJoinAvailability', () => {
  it('is none on hosted web (decision 5)', () => {
    expect(freenetJoinAvailability({ capability: null, native: false, workshopHub: false })).toBe(
      'none',
    );
  });

  it('is reader on an APK that cannot start its own node', () => {
    expect(freenetJoinAvailability({ capability: null, native: true, workshopHub: false })).toBe(
      'reader',
    );
  });

  it('is host on an APK that can start its own node even before :7509 answers', () => {
    expect(
      freenetJoinAvailability({
        capability: null,
        native: true,
        workshopHub: false,
        canStartOwnNode: true,
      }),
    ).toBe('host');
  });

  it('is host on Electron', () => {
    expect(
      freenetJoinAvailability({ capability: 'electron', native: false, workshopHub: false }),
    ).toBe('host');
  });

  it('is host on Android once a node can attach', () => {
    expect(
      freenetJoinAvailability({ capability: 'android', native: true, workshopHub: false }),
    ).toBe('host');
  });

  it('is host on the workshop hub', () => {
    expect(freenetJoinAvailability({ capability: null, native: false, workshopHub: true })).toBe(
      'host',
    );
  });
});
