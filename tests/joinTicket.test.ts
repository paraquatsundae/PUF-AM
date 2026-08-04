import { describe, expect, it } from 'vitest';

import {
  DEFAULT_JOIN_ROLE,
  JOIN_ROLES,
  JOIN_TICKET_SYMBOLS,
  coerceJoinRole,
  defaultJoinTicketExpiry,
  formatJoinTicketCode,
  isJoinManifestExpired,
  isJoinTicket,
  mintJoinTicket,
  normalizeJoinTicket,
  parseJoinManifestV2,
} from '../shared/sync/joinTicket.ts';

describe('short join ticket format', () => {
  it('mints PUF-XXXX-XXXX from 5 bytes of randomness', () => {
    const ticket = mintJoinTicket(() => new Uint8Array([0x00, 0x44, 0x32, 0x14, 0xc7]));
    expect(ticket).toMatch(/^PUF-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(ticket.replace(/-/g, '').slice(3)).toHaveLength(JOIN_TICKET_SYMBOLS);
  });

  it('mints distinct tickets from real randomness', () => {
    const minted = new Set(Array.from({ length: 50 }, () => mintJoinTicket()));
    expect(minted.size).toBe(50);
    for (const ticket of minted) expect(isJoinTicket(ticket)).toBe(true);
  });

  it('never emits the ambiguous Crockford symbols', () => {
    const body = mintJoinTicket(() => new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff]))
      .slice(4)
      .replace('-', '');
    expect(body).not.toMatch(/[ILOU]/);
  });

  it('normalizes case, spacing, and missing prefix to one canonical form', () => {
    const canonical = 'PUF-K7M2-9Q4X';
    for (const input of [
      'PUF-K7M2-9Q4X',
      'puf-k7m2-9q4x',
      'PUFK7M29Q4X',
      'K7M2-9Q4X',
      '  puf k7m2 9q4x  ',
      'PUF_K7M2_9Q4X',
    ]) {
      expect(normalizeJoinTicket(input)).toBe(canonical);
    }
  });

  it('applies Crockford substitutions so a misread ticket still resolves', () => {
    // O→0, I→1, L→1: what a phone camera or a whiteboard does to a ticket.
    expect(normalizeJoinTicket('PUF-OI2L-9Q4X')).toBe('PUF-0121-9Q4X');
  });

  it('folds U to V only in the body, never eating the prefix', () => {
    expect(normalizeJoinTicket('PUF-UUUU-9Q4X')).toBe('PUF-VVVV-9Q4X');
  });

  it('rejects wrong lengths and non-Crockford input', () => {
    for (const bad of ['', 'PUF', 'PUF-K7M2', 'PUF-K7M2-9Q4X5', 'PUF-K7M2-9Q4!', 'not a ticket']) {
      expect(normalizeJoinTicket(bad)).toBeNull();
      expect(isJoinTicket(bad)).toBe(false);
    }
  });

  it('groups a bare body into the operator-facing form', () => {
    expect(formatJoinTicketCode('K7M29Q4X')).toBe('PUF-K7M2-9Q4X');
  });
});

describe('join roles', () => {
  it('uses the mist vocabulary, not worker', () => {
    expect(JOIN_ROLES).toEqual(['owner', 'admin', 'farmer', 'viewer']);
    expect(JOIN_ROLES).not.toContain('worker');
  });

  it('defaults a shared ticket to farmer', () => {
    expect(DEFAULT_JOIN_ROLE).toBe('farmer');
    expect(coerceJoinRole(undefined)).toBe('farmer');
    expect(coerceJoinRole('worker')).toBe('farmer');
    expect(coerceJoinRole('owner')).toBe('owner');
    expect(coerceJoinRole('viewer')).toBe('viewer');
  });
});

describe('join manifest v2', () => {
  const base = {
    v: 2,
    farmId: 'farm-abc',
    hotUri: 'FN02@hot',
    bonesUri: 'FN02@bones',
    ticket: 'puf k7m2 9q4x',
  };

  it('parses a manifest and canonicalizes its ticket', () => {
    const manifest = parseJoinManifestV2({ ...base, role: 'admin' });
    expect(manifest).not.toBeNull();
    expect(manifest?.ticket).toBe('PUF-K7M2-9Q4X');
    expect(manifest?.role).toBe('admin');
  });

  it('falls back to farmer when role is missing or unknown', () => {
    expect(parseJoinManifestV2(base)?.role).toBe('farmer');
    expect(parseJoinManifestV2({ ...base, role: 'worker' })?.role).toBe('farmer');
  });

  it('carries a permissions bag for the v2 headroom, dropping junk values', () => {
    const manifest = parseJoinManifestV2({
      ...base,
      permissions: { canSpray: true, maxBlocks: 4, tier: 'crew', nested: { no: true } },
    });
    expect(manifest?.permissions).toEqual({ canSpray: true, maxBlocks: 4, tier: 'crew' });
  });

  it('omits permissions entirely when nothing usable is supplied', () => {
    expect(parseJoinManifestV2({ ...base, permissions: {} })?.permissions).toBeUndefined();
    expect(parseJoinManifestV2({ ...base, permissions: [1, 2] })?.permissions).toBeUndefined();
  });

  it('rejects a manifest missing the fields a joiner needs', () => {
    expect(parseJoinManifestV2({ ...base, v: 1 })).toBeNull();
    expect(parseJoinManifestV2({ ...base, hotUri: '' })).toBeNull();
    expect(parseJoinManifestV2({ ...base, bonesUri: '   ' })).toBeNull();
    expect(parseJoinManifestV2({ ...base, farmId: '' })).toBeNull();
    expect(parseJoinManifestV2({ ...base, ticket: 'nope' })).toBeNull();
    expect(parseJoinManifestV2(null)).toBeNull();
  });

  it('treats expiry as optional but enforces it once set', () => {
    const forever = parseJoinManifestV2(base)!;
    expect(isJoinManifestExpired(forever)).toBe(false);

    const stale = parseJoinManifestV2({ ...base, expires: '2020-01-01T00:00:00.000Z' })!;
    expect(isJoinManifestExpired(stale)).toBe(true);

    const fresh = parseJoinManifestV2({ ...base, expires: defaultJoinTicketExpiry() })!;
    expect(isJoinManifestExpired(fresh)).toBe(false);
  });

  it('ignores an unparseable expiry rather than locking the ticket out', () => {
    expect(parseJoinManifestV2({ ...base, expires: 'soon' })?.expires).toBeUndefined();
  });
});
