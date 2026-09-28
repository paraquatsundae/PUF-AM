/**
 * Map a People-list row onto a recovery remint.
 *
 * Same grant the owner already chose; a new InviteToken. Label stays on this
 * hub only (`Plans/SETTINGS_SYNC_AND_CREW.md` §4a).
 *
 * @see Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-19
 */

import { findJoinPreset, type JoinPreset } from '../../shared/sync/joinGrant.ts';
import type { JoinTicketLedgerRow } from '../../shared/sync/joinLedger.ts';
import type { JoinRole } from '../../shared/sync/joinTicket.ts';

export type RecoveryInviteFromRow = {
  label: string;
  preset?: JoinPreset;
  role?: JoinRole;
};

export function recoveryInviteFromLedgerRow(row: JoinTicketLedgerRow): RecoveryInviteFromRow {
  const label = (row.label || '').trim() || 'Unnamed ticket';
  const preset = findJoinPreset(row.preset);
  return {
    label,
    ...(preset ? { preset } : { role: row.role }),
  };
}
