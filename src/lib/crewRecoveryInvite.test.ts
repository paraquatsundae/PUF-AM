import { describe, expect, it } from 'vitest';

import { recoveryInviteFromLedgerRow } from './crewRecoveryInvite.ts';
import type { JoinTicketLedgerRow } from '../../shared/sync/joinLedger.ts';

function row(partial: Partial<JoinTicketLedgerRow>): JoinTicketLedgerRow {
  return {
    id: 'row-1',
    role: 'farmer',
    modules: ['dashboard', 'settings'],
    issuedAt: '2026-09-01T00:00:00.000Z',
    uses: 1,
    ...partial,
  };
}

describe('recoveryInviteFromLedgerRow', () => {
  it('keeps the owner label and named preset', () => {
    const from = recoveryInviteFromLedgerRow(row({ label: 'Dave — spray ute', preset: 'full_farmer' }));
    expect(from.label).toBe('Dave — spray ute');
    expect(from.preset?.id).toBe('full_farmer');
    expect(from.role).toBeUndefined();
  });

  it('falls back to the wire role when the ticket predates presets', () => {
    const from = recoveryInviteFromLedgerRow(row({ label: 'Sam', role: 'viewer' }));
    expect(from.label).toBe('Sam');
    expect(from.preset).toBeUndefined();
    expect(from.role).toBe('viewer');
  });

  it('names an unlabeled row so People still has a recovery target', () => {
    expect(recoveryInviteFromLedgerRow(row({})).label).toBe('Unnamed ticket');
  });
});
