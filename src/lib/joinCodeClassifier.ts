/**
 * Classify whatever was typed in the login join box.
 *
 * FarmCode-first (`Plans/LOGIN_JOIN_SINGLE_BOX.md` §2.3). The FarmCode is
 * never embedded in a ticket and must never appear in `hint` (hole 2).
 */

import { normalizePin } from '../../shared/auth/byoPin.ts';
import {
  JOIN_TICKET_PREFIX,
  JOIN_TICKET_SYMBOLS,
  formatJoinTicketInput,
  normalizeJoinTicket,
} from '../../shared/sync/joinTicket.ts';
import {
  FarmCodeError,
  decodeFarmCodeBytes,
  farmCodeSymbolCount,
  formatFarmCodeInput,
  isValidFarmCode,
  normalizeFarmCodeInput,
} from '../../units/mist-freenet/src/farm-code.ts';

export type JoinCodeKind = 'invite-pin' | 'farm-code' | 'join-ticket' | 'hub-pairing' | 'unknown';

export type JoinCodeClassification = {
  kind: JoinCodeKind;
  /** PIN as 8 stripped uppercase symbols; FarmCode as the `mist-fc-N  …` line; ticket as `PUF-XXXX-XXXX`. */
  normalized: string;
  /** Farmer-facing sentence when the shape was recognised but is off, or when `unknown`. Never a FarmCode. */
  hint?: string;
};

const PIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PIN_ONLY_FORBIDDEN = /[01IO]/;
const LABEL =
  /^(farm\s*code|recovery\s*(code|key|pin)|invite\s*pin|pin|ticket|join\s*ticket|code)\s*:?\s*/i;
const DASHES = /[\u2010\u2011\u2013\u2014\u2212]/g;

const HINT_EMPTY = 'Type the code you were given.';
const HINT_RAW_TICKET =
  'That is the raw Freenet ticket — it goes in Settings → Sync → Advanced after you have joined.';
const HINT_FARM_ID = 'That is a farm ID, not a code. On a bring-your-own device it goes beside the PIN.';
const HINT_TICKET_SHORT =
  'A join ticket is PUF- and eight letters or numbers — check for a missed one.';
const HINT_BARE_TICKET = 'Read as a join ticket without its PUF- — check that is what you meant.';
const HINT_PIN_SHORT = 'Invite PINs are 8 characters — one may be missing.';
const HINT_UNLOCK = 'A 4–8 digit number is a device unlock PIN, not a way into a farm.';
const HINT_UNKNOWN =
  'Not a PIN, FarmCode or join ticket. PINs are 8 letters/numbers; FarmCodes are 17 in groups of five; tickets start with PUF-.';

export const TICKET_FIRST_NOTICE = 'That is the join ticket — the paper FarmCode comes first';

function tidy(raw: string): string {
  return String(raw ?? '')
    .trim()
    .replace(DASHES, '-')
    .replace(/\s+/g, ' ');
}

function stripLabel(s: string): string {
  return s.replace(LABEL, '');
}

function cleanedSymbols(s: string): string {
  return s.toUpperCase().replace(/[^0-9A-Z*~$=]/g, '');
}

function allPinAlphabet(s: string): boolean {
  return s.length > 0 && [...s].every((ch) => PIN_ALPHABET.includes(ch));
}

function classifyFarmCode(s: string): JoinCodeClassification {
  try {
    const normalized = normalizeFarmCodeInput(s);
    if (isValidFarmCode(normalized)) {
      decodeFarmCodeBytes(normalized);
      return { kind: 'farm-code', normalized };
    }
    try {
      decodeFarmCodeBytes(normalized);
    } catch (err) {
      return {
        kind: 'farm-code',
        normalized: '',
        hint: err instanceof FarmCodeError ? err.message : 'Could not read that FarmCode',
      };
    }
    return { kind: 'farm-code', normalized: '', hint: 'Could not read that FarmCode' };
  } catch (err) {
    return {
      kind: 'farm-code',
      normalized: '',
      hint: err instanceof FarmCodeError ? err.message : 'Could not read that FarmCode',
    };
  }
}

function classifyPrefixedTicket(s: string): JoinCodeClassification {
  const normalized = normalizeJoinTicket(s);
  if (normalized) return { kind: 'join-ticket', normalized };
  return { kind: 'join-ticket', normalized: '', hint: HINT_TICKET_SHORT };
}

export function classifyJoinCode(input: string): JoinCodeClassification {
  let s = tidy(input);
  if (!s) return { kind: 'unknown', normalized: '', hint: HINT_EMPTY };
  s = stripLabel(s);

  if (s.startsWith('{') || /FN02@/i.test(s)) {
    return { kind: 'unknown', normalized: '', hint: HINT_RAW_TICKET };
  }
  if (/^farm_[0-9a-f]{16}$/i.test(s)) {
    return { kind: 'unknown', normalized: s, hint: HINT_FARM_ID };
  }

  if (/^mist[\s-]*fc[\s-]*\d+/i.test(s)) {
    return classifyFarmCode(s);
  }

  const pufMatch = s.match(/^PUF[\s-]*/i);
  if (pufMatch) {
    const afterPrefix = cleanedSymbols(s.slice(pufMatch[0].length)).replace(/[*~$=]/g, '');
    const total = cleanedSymbols(s).replace(/[*~$=]/g, '');
    if (
      afterPrefix.length === JOIN_TICKET_SYMBOLS &&
      total.length === JOIN_TICKET_PREFIX.length + JOIN_TICKET_SYMBOLS
    ) {
      return classifyPrefixedTicket(s);
    }
    // `PUF-…` with a separator is certainly a ticket, even if a symbol is missing.
    // `PUFK7M29` is an 8-char PIN that happens to start with PUF — fall through.
    if (/^PUF[\s-]+/i.test(s)) {
      return { kind: 'join-ticket', normalized: '', hint: HINT_TICKET_SHORT };
    }
  }

  const hubMatch = s.match(/^HUB[\s-]*/i);
  if (hubMatch) {
    const body = cleanedSymbols(s.slice(hubMatch[0].length)).replace(/[*~$=]/g, '');
    if (body.length === 8) {
      return { kind: 'hub-pairing', normalized: `${body.slice(0, 4)}-${body.slice(4)}` };
    }
  }

  const cleaned = cleanedSymbols(s);

  if (cleaned.length === 17 || cleaned.length === 27) {
    return classifyFarmCode(cleaned);
  }

  if (cleaned.length === 8) {
    if (PIN_ONLY_FORBIDDEN.test(cleaned)) {
      const normalized = normalizeJoinTicket(cleaned);
      return {
        kind: 'join-ticket',
        normalized: normalized ?? '',
        hint: HINT_BARE_TICKET,
      };
    }
    if (allPinAlphabet(cleaned)) {
      return { kind: 'invite-pin', normalized: normalizePin(cleaned) };
    }
    return { kind: 'unknown', normalized: cleaned, hint: HINT_UNKNOWN };
  }

  if ((cleaned.length === 6 || cleaned.length === 7) && allPinAlphabet(cleaned)) {
    return { kind: 'invite-pin', normalized: normalizePin(cleaned), hint: HINT_PIN_SHORT };
  }

  if (/^\d{4,8}$/.test(cleaned)) {
    return { kind: 'unknown', normalized: cleaned, hint: HINT_UNLOCK };
  }

  return { kind: 'unknown', normalized: cleaned, hint: HINT_UNKNOWN };
}

/** Live box format: PIN unchanged; ticket hyphenated; FarmCode once 9+ symbols and no `PUF`. */
export function formatJoinCodeInput(raw: string): string {
  const kind = classifyJoinCode(raw).kind;
  if (kind === 'join-ticket') return formatJoinTicketInput(raw);
  const noPuf = !/^PUF/i.test(raw.trim());
  const cleaned = raw.toUpperCase().replace(/[^0-9A-Z*~$=]/g, '');
  if (kind === 'farm-code' || (noPuf && cleaned.length >= 9)) {
    return formatFarmCodeInput(raw);
  }
  return raw;
}

/** The box can Continue — a recognised kind with a usable normalized value. */
export function joinCodeCanContinue(classification: JoinCodeClassification): boolean {
  if (classification.kind === 'invite-pin') return classification.normalized.length === 8;
  if (classification.kind === 'farm-code' || classification.kind === 'join-ticket') {
    return Boolean(classification.normalized);
  }
  return false;
}

export function joinCodeLooksLine(classification: JoinCodeClassification, input: string): string {
  if (classification.hint) return classification.hint;
  if (classification.kind === 'invite-pin') return 'Looks like an invite PIN';
  if (classification.kind === 'join-ticket') return 'Looks like a join ticket';
  if (classification.kind === 'farm-code') {
    const n = farmCodeSymbolCount(input);
    const target = n > 17 ? 27 : 17;
    return `Looks like a FarmCode — ${n}/${target}`;
  }
  if (classification.kind === 'hub-pairing') return 'Looks like a hub pairing code';
  return '';
}
