/**
 * Farm setup → People.
 *
 * "Who is on this farm" is a question with two different answers depending on
 * which pipe the farm was created against, and until now only one of them had a
 * screen. A cloud farm has Firestore members and invite PINs. A Freenet farm has
 * no account system at all — the nearest thing to a personnel record is the set
 * of join tickets the owner has handed out, kept on the hub that minted them
 * (`server/joinManifestStore.ts`).
 *
 * So this card reads that shelf and prints it: who each ticket was for, what it
 * grants, when it stops working, and whether anyone has actually used it. The
 * ticket bodies are never in the response — see `shared/sync/joinLedger.ts`.
 *
 * Two honest limits are on the card rather than in this comment, because the
 * operator is the one who has to act on them:
 *
 * - **The shelf belongs to the hub.** Tickets minted on the other laptop are on
 *   the other laptop's shelf. The card names the hub that answered.
 * - **Revoking stops issuance, not access.** A device that already pulled the
 *   farm keeps its copy. Revoking means "stop handing this out"; taking the
 *   farm back means a new FarmCode. A crew device that signed out without a
 *   PIN needs a new recovery invite from this card — not the FarmCode.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §4a
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Ticket, UserPlus, Users } from 'lucide-react';

import { PackSurfaces } from './PackSurfaces';
import { FreenetPeopleLedger } from './FreenetPeopleLedger';
import { useAuth } from '../contexts/AuthContext';
import { activeFarmPipes, freenetPlaneFarmId } from '../lib/farmPipes';

function CloudPeople() {
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        This farm syncs through the cloud, so people are members of the farm account and join with
        an invite PIN.
      </p>
      <Link
        to="/farm-management"
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50"
      >
        <UserPlus className="w-3.5 h-3.5" />
        Team &amp; access
      </Link>
    </div>
  );
}

export function FarmPeopleCard() {
  const { userData, farmEnabledModules } = useAuth();
  const farmId = userData?.farmId;
  // Three states. A hybrid *member* has the cloud roster and, below it, the
  // tickets this hub handed out for the mirror; a hybrid *mirror* device has
  // only the tickets, like a Freenet farm.
  const pipes = activeFarmPipes(farmId);
  const pipe = pipes.cloudMirror ? 'freenet' : pipes.cloud ? 'cloud' : 'freenet';
  // Tickets are keyed by the mist id, which on a hybrid member is not the cloud id.
  const ticketFarmId = pipes.freenet ? freenetPlaneFarmId() ?? farmId : null;
  const showTickets = Boolean(ticketFarmId);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-violet-700" />
            People
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {pipe === 'freenet'
              ? 'Everyone this farm has been handed to, and what their ticket lets them see.'
              : 'Who is on this farm and what they can reach.'}
          </p>
        </div>
        {pipe === 'freenet' && (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <PackSurfaces surface="howItWorks" />
            <Link
              to="/settings"
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50"
            >
              <Ticket className="w-3.5 h-3.5" />
              Send this farm
            </Link>
          </div>
        )}
      </div>

      {pipe === 'cloud' && <CloudPeople />}
      {pipe === 'cloud' && showTickets && (
        <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-100">
          <span className="font-semibold text-slate-700">Freenet mirror.</span> Anyone read a join
          ticket below can read the whole mirror, whatever their cloud role — and revoking a ticket
          does not take a copy back.
        </p>
      )}
      {ticketFarmId ? (
        <FreenetPeopleLedger farmId={ticketFarmId} farmEnabledModules={farmEnabledModules} />
      ) : pipe !== 'cloud' ? (
        <p className="text-xs text-slate-400 py-2">Sign in to this farm to see who is on it.</p>
      ) : null}
    </div>
  );
}
