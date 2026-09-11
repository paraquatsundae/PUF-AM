/**
 * Ticket-only draft across the FarmCode → gate reload.
 * `Plans/LOGIN_JOIN_SINGLE_BOX.md` · `Plans/NAMING.md` §5.
 * Never write a FarmCode here.
 */

import { normalizeJoinTicket } from '../../shared/sync/joinTicket.ts';

export const JOIN_TICKET_DRAFT_KEY = 'pufam.mist.joinTicketDraft.v1';

function session(): Storage | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

/** Persist a canonical `PUF-XXXX-XXXX` only. No-op on anything else. */
export function writeJoinTicketDraft(ticket: string): void {
  const normalized = normalizeJoinTicket(ticket);
  if (!normalized) return;
  session()?.setItem(JOIN_TICKET_DRAFT_KEY, normalized);
}

/** Read then clear. Returns a canonical ticket or null. */
export function takeJoinTicketDraft(): string | null {
  const store = session();
  if (!store) return null;
  const raw = store.getItem(JOIN_TICKET_DRAFT_KEY);
  store.removeItem(JOIN_TICKET_DRAFT_KEY);
  if (!raw) return null;
  return normalizeJoinTicket(raw);
}
