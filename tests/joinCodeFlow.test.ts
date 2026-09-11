/**
 * FarmCode-first join reducer. Plans/LOGIN_JOIN_SINGLE_BOX.md §2.10.
 */

import { describe, expect, it } from 'vitest';

import { encodeFarmCodeFromBytes } from '../units/mist-freenet/src/farm-code.ts';
import { TICKET_FIRST_NOTICE } from '../src/lib/joinCodeClassifier.ts';
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

  it('ticket-first holds heldTicket and stays on code', () => {
    const s = apply([{ type: 'TYPE', input: 'PUF-K7M2-9Q4X' }, { type: 'CONTINUE' }], 'host');
    expect(s.stage).toBe('code');
    expect(s.heldTicket).toBe('PUF-K7M2-9Q4X');
    expect(s.notice).toBe(TICKET_FIRST_NOTICE);
    expect(s.input).toBe('');
  });

  it('ticket on hosted web discards and goes to freenet-unavailable', () => {
    const s = apply([{ type: 'TYPE', input: 'PUF-K7M2-9Q4X' }, { type: 'CONTINUE' }], 'none');
    expect(s.stage).toBe('freenet-unavailable');
    expect(s.heldTicket).toBeNull();
  });

  it('BACK clears heldTicket', () => {
    const s = apply(
      [{ type: 'TYPE', input: 'PUF-K7M2-9Q4X' }, { type: 'CONTINUE' }, { type: 'BACK' }],
      'host',
    );
    expect(s.heldTicket).toBeNull();
    expect(s.notice).toBeNull();
    expect(s.stage).toBe('code');
  });

  it('never advances a ticket to the Freenet step (FarmCode-first)', () => {
    const s = apply([{ type: 'TYPE', input: 'PUF-K7M2-9Q4X' }, { type: 'CONTINUE' }], 'host');
    expect(s.stage).not.toBe('freenet');
  });
});

describe('freenetJoinAvailability', () => {
  it('is none on hosted web (decision 5)', () => {
    expect(freenetJoinAvailability({ capability: null, native: false, workshopHub: false })).toBe(
      'none',
    );
  });

  it('is reader on an APK', () => {
    expect(freenetJoinAvailability({ capability: null, native: true, workshopHub: false })).toBe(
      'reader',
    );
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
