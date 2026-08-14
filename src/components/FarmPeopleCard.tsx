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
 *   farm keeps it — it holds the FarmSeed. Revoking means "stop handing this
 *   out"; taking the farm back means a new FarmCode.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §4a
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Loader2, Ticket, UserPlus, Users } from 'lucide-react';

import { FreenetHowItWorksButton } from './FreenetHowItWorks';
import { useAuth } from '../contexts/AuthContext';
import { activeFarmPipe } from '../lib/farmPipes';
import { fetchJoinTicketLedger, revokeJoinTicket } from '../lib/joinLedger';
import type { JoinTicketLedgerRow } from '../../shared/sync/joinLedger';
import { findJoinPreset } from '../../shared/sync/joinGrant';
import { joinRoleLabel } from '../../shared/sync/joinTicket';
import { MODULE_LABELS, type FarmModuleId } from '../../shared/auth/farmModules';

function shortDate(iso?: string): string {
  if (!iso) return '—';
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '—' : at.toLocaleDateString();
}

/** "Field only" if the owner picked a preset, else the bare role a ticket carried. */
function grantLabel(row: JoinTicketLedgerRow): string {
  return findJoinPreset(row.preset)?.label ?? joinRoleLabel(row.role);
}

function moduleSummary(modules: FarmModuleId[]): string {
  const named = modules.filter((id) => id !== 'dashboard').map((id) => MODULE_LABELS[id]);
  return named.length ? named.join(' · ') : 'Dashboard only';
}

function expiryNote(row: JoinTicketLedgerRow): string {
  if (!row.expires) return 'No expiry';
  const at = Date.parse(row.expires);
  if (!Number.isFinite(at)) return 'No expiry';
  const days = Math.ceil((at - Date.now()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Expired';
  return days === 1 ? 'Stops tomorrow' : `Stops in ${days} days`;
}

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

function FreenetPeople({ farmId }: { farmId: string }) {
  const [rows, setRows] = useState<JoinTicketLedgerRow[] | null>(null);
  const [shelf, setShelf] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ledger = await fetchJoinTicketLedger(farmId);
      setRows(ledger.rows);
      setShelf(ledger.shelf);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the join tickets on this hub');
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, [farmId]);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (row: JoinTicketLedgerRow) => {
    setBusyId(row.id);
    setError(null);
    try {
      await revokeJoinTicket(row.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke that ticket');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-2 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </p>
      )}

      {loading && rows === null ? (
        <p className="text-xs text-slate-400 py-3 inline-flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Reading this hub&apos;s join tickets…
        </p>
      ) : rows && rows.length === 0 ? (
        <div className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-3 py-3 space-y-1">
          <p className="font-semibold text-slate-700">
            Tickets live on the laptop that Sent
            {shelf ? (
              <>
                {' '}
                — this list is <code className="font-mono">{shelf}</code>
              </>
            ) : (
              ' — this list is this computer'
            )}
            .
          </p>
          <p>Nobody has been given a ticket on this hub yet.</p>
          <p>
            It is just you and the devices you have already set up. To put this farm on somebody
            else&apos;s laptop or tablet, use{' '}
            <Link to="/settings?tab=sync" className="font-semibold text-emerald-700 hover:underline">
              Settings → Sync → Send this farm
            </Link>{' '}
            and read them the ticket it gives you. Tickets minted on a different laptop stay on that
            laptop&apos;s list.
          </p>
        </div>
      ) : rows ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50/60"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-900 truncate">
                  {row.label || 'Unnamed ticket'}
                </p>
                <p className="text-[10px] text-slate-500 leading-snug">
                  {grantLabel(row)} · {moduleSummary(row.modules)}
                </p>
              </div>
              <div className="text-[10px] text-slate-500 sm:text-right shrink-0 leading-snug">
                <p>
                  Given out {shortDate(row.issuedAt)} · {expiryNote(row)}
                </p>
                <p>
                  {row.uses > 0
                    ? `Last used ${shortDate(row.lastUsedAt)}${row.uses > 1 ? ` · ${row.uses} times` : ''}`
                    : 'Not used yet'}
                </p>
              </div>
              <button
                type="button"
                disabled={busyId === row.id}
                onClick={() => void revoke(row)}
                title="Stop this ticket working for anyone new"
                className="self-start sm:self-auto shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold text-rose-700 px-2 py-1 rounded-lg border border-rose-100 bg-white hover:bg-rose-50 disabled:opacity-50"
              >
                {busyId === row.id && <Loader2 className="w-3 h-3 animate-spin" />}
                Revoke
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="text-[10px] text-slate-400 leading-snug space-y-1 border-t border-slate-100 pt-2">
        <p>
          Read from {shelf ? <code className="font-mono">{shelf}</code> : 'this computer'}. Tickets
          you handed out from a <strong>different</strong> laptop are on that laptop&apos;s list.
        </p>
        <p>
          Revoking stops the ticket working for anyone new. A device that already pulled the farm
          keeps its copy — the only way to shut that out is a new FarmCode.
        </p>
      </div>
    </div>
  );
}

export function FarmPeopleCard() {
  const { userData } = useAuth();
  const farmId = userData?.farmId;
  const pipe = activeFarmPipe();

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
            <FreenetHowItWorksButton />
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

      {pipe === 'cloud' ? (
        <CloudPeople />
      ) : farmId ? (
        <FreenetPeople farmId={farmId} />
      ) : (
        <p className="text-xs text-slate-400 py-2">Sign in to this farm to see who is on it.</p>
      )}
    </div>
  );
}
