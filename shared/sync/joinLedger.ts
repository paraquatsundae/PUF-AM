/**
 * The People list's row — a join-ticket shelf entry with the ticket taken out.
 *
 * A Freenet farm has no members collection: the closest thing to a personnel
 * record is the set of live join manifests the owner's hub minted, so that shelf
 * is what the People page reads (`Plans/SETTINGS_SYNC_AND_CREW.md` §4).
 *
 * **The ticket itself is never in here, and that is the point.** A ticket is a
 * bearer capability — anyone holding it can learn where this farm's ciphertext
 * sits on Freenet — so a list of the live ones, served on a LAN endpoint, would
 * be a worse thing to have than the problem it solves. Rows are addressed by a
 * random `id` instead, which is also what revoking one names.
 *
 * @see server/joinManifestStore.ts
 */

import type { FarmModuleId } from '../auth/farmModules.ts';
import type { JoinPresetId } from './joinGrant.ts';
import type { JoinRole } from './joinTicket.ts';

export type JoinTicketLedgerRow = {
  /** Opaque handle for revoke. Not derived from the ticket. */
  id: string;
  /** What the owner typed when they sent the farm. Absent on older entries. */
  label?: string;
  role: JoinRole;
  /** The words the owner actually picked — "Field only". Absent before §3b. */
  preset?: JoinPresetId;
  /** Nav entries this ticket hands over, for a page that wants to spell it out. */
  modules: FarmModuleId[];
  issuedAt: string;
  expires?: string;
  /** Last time a device asked what this ticket means — not proof it got in. */
  lastUsedAt?: string;
  /** How many such lookups, capped by the shelf's stamp limit. */
  uses: number;
};

export type JoinTicketLedger = {
  farmId: string;
  rows: JoinTicketLedgerRow[];
  /** Which hub answered. Two laptops that both publish keep two ledgers. */
  shelf: string;
};
