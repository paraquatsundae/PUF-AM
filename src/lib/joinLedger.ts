/**
 * Renderer side of the join-ticket ledger — the People list's data source.
 *
 * Aimed at the same Express the join-ticket register and resolve calls go to
 * (`mistLocalApiUrl`): the desktop shell's own loopback API, or the laptop a
 * tablet is paired to. That is where the shelf physically is, so a farm whose
 * tickets were minted on another laptop honestly reads as empty here — the page
 * says which hub answered rather than pretending there is one roster.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §4a
 */

import type { JoinTicketLedger } from '../../shared/sync/joinLedger.ts';
import { apiFetch, apiHubMissing, mistLocalApiUrl, NO_API_HUB_MESSAGE } from './apiBase.ts';

async function readError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error || `${fallback} (${res.status})`;
}

export async function fetchJoinTicketLedger(farmId: string): Promise<JoinTicketLedger> {
  if (apiHubMissing()) throw new Error(NO_API_HUB_MESSAGE);

  const res = await apiFetch(
    mistLocalApiUrl(`/api/sync/join-tickets?farmId=${encodeURIComponent(farmId)}`),
  );
  if (!res.ok) throw new Error(await readError(res, 'Could not read the join tickets on this hub'));

  const body = (await res.json()) as Partial<JoinTicketLedger>;
  return {
    farmId,
    rows: Array.isArray(body.rows) ? body.rows : [],
    shelf: typeof body.shelf === 'string' ? body.shelf : '',
  };
}

/** Stop this ticket being handed out again. Does not reach a device that already joined. */
export async function revokeJoinTicket(id: string): Promise<boolean> {
  if (apiHubMissing()) throw new Error(NO_API_HUB_MESSAGE);

  const res = await apiFetch(mistLocalApiUrl(`/api/sync/join-tickets/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await readError(res, 'Could not revoke that join ticket'));

  const body = (await res.json().catch(() => ({}))) as { revoked?: boolean };
  return body.revoked === true;
}
