/**
 * Join-box classifier — 26-row matrix + mint properties.
 * Plans/LOGIN_JOIN_SINGLE_BOX.md §2.3 / §2.10.
 */

import { describe, expect, it } from 'vitest';

import { generatePinCode } from '../shared/auth/byoPin.ts';
import { mintJoinTicket } from '../shared/sync/joinTicket.ts';
import { mintPairingCode } from '../desktop/lanHubAuth.ts';
import {
  encodeFarmCodeFromBytes,
  mintFarmCode,
  normalizeFarmCodeInput,
} from '../units/mist-freenet/src/farm-code.ts';
import { classifyJoinCode, joinCodeCanContinue } from '../src/lib/joinCodeClassifier.ts';

function bodyOf(formatted: string): string {
  return formatted.replace(/^mist-fc-\d+\s+/, '').replace(/-/g, '');
}

const validV2 = encodeFarmCodeFromBytes(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
const validV2Body = bodyOf(validV2);
const validV1 = encodeFarmCodeFromBytes(new Uint8Array(16).fill(7));
const validV1Body = bodyOf(validV1);
const wrongCheck17 = `${validV2Body.slice(0, 16)}${validV2Body.slice(-1) === '0' ? '2' : '0'}`;

const MATRIX: Array<{
  n: number;
  input: string;
  kind: ReturnType<typeof classifyJoinCode>['kind'];
  normalized?: string;
  hint?: RegExp | false;
}> = [
  { n: 1, input: 'K7M2N9QX', kind: 'invite-pin', normalized: 'K7M2N9QX', hint: false },
  { n: 2, input: 'k7m2 n9qx', kind: 'invite-pin', normalized: 'K7M2N9QX', hint: false },
  { n: 3, input: 'K7M2-N9QX', kind: 'invite-pin', normalized: 'K7M2N9QX', hint: false },
  { n: 4, input: 'PUFK7M29', kind: 'invite-pin', normalized: 'PUFK7M29', hint: false },
  { n: 5, input: 'PUF-K7M2-9Q4X', kind: 'join-ticket', normalized: 'PUF-K7M2-9Q4X', hint: false },
  { n: 6, input: 'puf k7m2 9q4x', kind: 'join-ticket', normalized: 'PUF-K7M2-9Q4X', hint: false },
  { n: 7, input: 'PUFK7M29Q4X', kind: 'join-ticket', normalized: 'PUF-K7M2-9Q4X', hint: false },
  { n: 8, input: 'PUF-K7M2-9Q4', kind: 'join-ticket', normalized: '', hint: /eight letters or numbers/ },
  { n: 9, input: 'K7M2-9Q4X', kind: 'invite-pin', normalized: 'K7M29Q4X', hint: false },
  { n: 10, input: 'K7M2-9Q0X', kind: 'join-ticket', normalized: 'PUF-K7M2-9Q0X', hint: /join ticket without its PUF/ },
  { n: 11, input: 'K7M2-9QOX', kind: 'join-ticket', normalized: 'PUF-K7M2-9Q0X', hint: /join ticket without its PUF/ },
  { n: 12, input: validV2, kind: 'farm-code', normalized: validV2, hint: false },
  {
    n: 13,
    input: `FarmCode: mist - fc - 2 ${validV2Body.toLowerCase()}`,
    kind: 'farm-code',
    normalized: validV2,
    hint: false,
  },
  { n: 14, input: validV2Body, kind: 'farm-code', normalized: validV2, hint: false },
  { n: 15, input: wrongCheck17, kind: 'farm-code', normalized: '', hint: /check character mismatch/i },
  { n: 16, input: validV1Body, kind: 'farm-code', normalized: validV1, hint: false },
  { n: 17, input: 'mist-fc-3  ABCDE-FGHJK-MNPQR-ST', kind: 'farm-code', normalized: '', hint: /unsupported/i },
  { n: 18, input: 'ABCDEFGHJKMNPQRS', kind: 'unknown', hint: /Not a PIN, FarmCode or join ticket/ },
  { n: 19, input: 'K7M2N9Q', kind: 'invite-pin', normalized: 'K7M2N9Q', hint: /8 characters/ },
  { n: 20, input: '1234', kind: 'unknown', normalized: '1234', hint: /unlock PIN/ },
  { n: 21, input: '23456789', kind: 'invite-pin', normalized: '23456789', hint: false },
  {
    n: 22,
    input: 'farm_0123456789abcdef',
    kind: 'unknown',
    normalized: 'farm_0123456789abcdef',
    hint: /farm ID/,
  },
  { n: 23, input: '{"hotUri":"FN02@example"}', kind: 'unknown', normalized: '', hint: /raw Freenet ticket/ },
  { n: 24, input: 'HUB-K7M2-9Q4X', kind: 'hub-pairing', normalized: 'K7M2-9Q4X', hint: false },
  { n: 25, input: '   ', kind: 'unknown', normalized: '', hint: /Type the code/ },
  { n: 26, input: 'PUF–K7M2–9Q4X', kind: 'join-ticket', normalized: 'PUF-K7M2-9Q4X', hint: false },
];

describe('classifyJoinCode matrix', () => {
  it.each(MATRIX)('#$n $kind', ({ input, kind, normalized, hint }) => {
    const got = classifyJoinCode(input);
    expect(got.kind).toBe(kind);
    if (normalized !== undefined) expect(got.normalized).toBe(normalized);
    if (hint === false) expect(got.hint).toBeUndefined();
    else if (hint) expect(got.hint ?? '').toMatch(hint);
  });
});

describe('classifyJoinCode mint properties', () => {
  it('classifies every minted join ticket as join-ticket', () => {
    for (let i = 0; i < 12; i++) {
      const ticket = mintJoinTicket();
      const got = classifyJoinCode(ticket);
      expect(got.kind, ticket).toBe('join-ticket');
      expect(got.normalized).toBe(ticket);
    }
  });

  it('classifies every minted PIN as invite-pin', () => {
    for (let i = 0; i < 12; i++) {
      const pin = generatePinCode(8);
      expect(classifyJoinCode(pin).kind, pin).toBe('invite-pin');
    }
  });

  it('classifies every minted FarmCode as farm-code with the canonical line', async () => {
    for (let i = 0; i < 6; i++) {
      const code = await mintFarmCode();
      const got = classifyJoinCode(code);
      expect(got.kind).toBe('farm-code');
      expect(got.normalized).toBe(normalizeFarmCodeInput(code));
      expect(got.hint).toBeUndefined();
    }
  });

  it('never classifies a minted pairing code as hub-pairing', () => {
    for (let i = 0; i < 20; i++) {
      expect(classifyJoinCode(mintPairingCode()).kind).not.toBe('hub-pairing');
    }
  });

  it('canContinue is false for an invalid FarmCode or short ticket', () => {
    expect(joinCodeCanContinue(classifyJoinCode(wrongCheck17))).toBe(false);
    expect(joinCodeCanContinue(classifyJoinCode('PUF-K7M2-9Q4'))).toBe(false);
    expect(joinCodeCanContinue(classifyJoinCode(validV2))).toBe(true);
    expect(joinCodeCanContinue(classifyJoinCode('K7M2N9QX'))).toBe(true);
    expect(joinCodeCanContinue(classifyJoinCode('K7M2N9Q'))).toBe(false);
  });

  it('never returns the FarmCode in hint', async () => {
    const code = await mintFarmCode();
    const body = bodyOf(code);
    const samples = [code, `FarmCode: ${code}`, body, `${body.slice(0, -1)}0`, 'mist-fc-3  ABCDE-FGHJK-MNPQR-ST'];
    for (const input of samples) {
      const hint = classifyJoinCode(input).hint ?? '';
      expect(hint.includes(code)).toBe(false);
      expect(hint.includes(body)).toBe(false);
    }
  });
});
