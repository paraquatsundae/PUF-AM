/**
 * Farm setup → People, Freenet body: this hub's join-ticket ledger plus
 * admin remint of a recovery invite.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §4a
 * @see Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-19
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, KeyRound, Loader2 } from 'lucide-react';

import { fetchJoinTicketLedger, revokeJoinTicket } from '../lib/joinLedger';
import { recoveryInviteFromLedgerRow, type RecoveryInviteFromRow } from '../lib/crewRecoveryInvite';
import type { JoinTicketLedgerRow } from '../../shared/sync/joinLedger';
import { findJoinPreset, joinPresetsForFarm, type JoinPresetId } from '../../shared/sync/joinGrant';
import { joinRoleLabel } from '../../shared/sync/joinTicket';
import { MODULE_LABELS, type FarmModuleId } from '../../shared/auth/farmModules';
import {
  getMistSessionMeta,
  mistSessionCanSendFarm,
  mistSessionCloudFarmId,
} from '../mist/mistDeviceSession';
import { mistPublishNeedsDevicePin } from '../mist/mistHotBridge';
import { issueCrewRecoveryInvite } from '../mist/issueCrewRecoveryInvite';
import type { IssueCrewInviteResult } from '../mist/issueCrewInvite';

function shortDate(iso?: string): string {
  if (!iso) return '—';
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '—' : at.toLocaleDateString();
}

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

type Props = {
  farmId: string;
  farmEnabledModules: FarmModuleId[];
};

export function FreenetPeopleLedger({ farmId, farmEnabledModules }: Props) {
  const [rows, setRows] = useState<JoinTicketLedgerRow[] | null>(null);
  const [shelf, setShelf] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [devicePin, setDevicePin] = useState('');
  const [needsPin, setNeedsPin] = useState(() => mistPublishNeedsDevicePin());
  const [issued, setIssued] = useState<IssueCrewInviteResult | null>(null);
  const [newName, setNewName] = useState('');
  const [newPresetId, setNewPresetId] = useState<JoinPresetId>('full_farmer');

  const canIssue = mistSessionCanSendFarm(getMistSessionMeta());
  const presets = joinPresetsForFarm(farmEnabledModules);
  const hybridId = mistSessionCloudFarmId();

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

  const issue = async (label: string, from: Omit<RecoveryInviteFromRow, 'label'>) => {
    if (!canIssue) return;
    const pin = devicePin.trim();
    if (needsPin && pin.length < 4) {
      setError('Enter this device’s PIN to unlock the farm before issuing a recovery code.');
      return;
    }
    setError(null);
    setIssued(null);
    try {
      const result = await issueCrewRecoveryInvite({
        farmId,
        label,
        ...(from.preset ? { preset: from.preset } : {}),
        ...(from.role ? { role: from.role } : {}),
        ...(pin ? { devicePin: pin } : {}),
        ...(hybridId ? { hybrid: { cloudFarmId: hybridId } } : {}),
      });
      setNeedsPin(mistPublishNeedsDevicePin());
      if (!result.shortTicket) {
        throw new Error(
          result.shortTicketError ??
            'The farm is on Freenet, but this device could not put a recovery invite on its hub.',
        );
      }
      setIssued(result);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not issue a recovery code');
    }
  };

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

  const recoverRow = async (row: JoinTicketLedgerRow) => {
    setBusyId(`recover:${row.id}`);
    try {
      const from = recoveryInviteFromLedgerRow(row);
      await issue(from.label, from);
    } finally {
      setBusyId(null);
    }
  };

  const recoverNamed = async () => {
    const label = newName.trim();
    if (!label) {
      setError('Name who this recovery code is for.');
      return;
    }
    setBusyId('recover:named');
    try {
      const preset = findJoinPreset(newPresetId) ?? presets[0];
      await issue(label, { preset });
      setNewName('');
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
              <div className="flex flex-wrap gap-1.5 self-start sm:self-auto shrink-0">
                {canIssue && (
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void recoverRow(row)}
                    title="Mint a new invite for this person — they signed out without a device PIN"
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 px-2 py-1 rounded-lg border border-emerald-200 bg-white hover:bg-emerald-50 disabled:opacity-50"
                  >
                    {busyId === `recover:${row.id}` && <Loader2 className="w-3 h-3 animate-spin" />}
                    New code
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void revoke(row)}
                  title="Stop this ticket working for anyone new"
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-rose-700 px-2 py-1 rounded-lg border border-rose-100 bg-white hover:bg-rose-50 disabled:opacity-50"
                >
                  {busyId === row.id && <Loader2 className="w-3 h-3 animate-spin" />}
                  Revoke
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {canIssue && (
        <div className="space-y-2 border border-slate-100 rounded-xl px-3 py-3 bg-white">
          <p className="text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-emerald-700" />
            Recovery code
          </p>
          <p className="text-[11px] text-slate-500 leading-snug">
            If someone signed out without a device PIN, their session is gone and the old invite
            cannot get them back in. Issue a new crew invite for that person — they type only this,
            not the FarmCode.
          </p>
          {needsPin && (
            <input
              value={devicePin}
              onChange={(e) => setDevicePin(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              type="password"
              autoComplete="off"
              placeholder="Device PIN"
              className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 font-mono text-sm"
            />
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={60}
              placeholder="Name on this list"
              className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm"
            />
            <select
              value={newPresetId}
              onChange={(e) => setNewPresetId(e.target.value as JoinPresetId)}
              className="sm:w-44 px-2 py-2 rounded-lg border border-slate-200 text-sm"
            >
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busyId !== null || (needsPin && devicePin.trim().length < 4)}
              onClick={() => void recoverNamed()}
              className="inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold text-emerald-800 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50"
            >
              {busyId === 'recover:named' && <Loader2 className="w-3 h-3 animate-spin" />}
              Issue code
            </button>
          </div>
        </div>
      )}

      {issued?.shortTicket && (
        <div className="space-y-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-3">
          <p className="text-xs font-semibold text-emerald-900">
            Recovery invite · {findJoinPreset(issued.shortTicketPreset)?.label ?? joinRoleLabel(issued.shortTicketRole)}
          </p>
          <p className="font-mono text-sm font-bold tracking-wider text-emerald-900 text-center py-1 select-all break-all">
            {issued.shortTicket}
          </p>
          <p className="text-[11px] text-emerald-800">
            They type only this at Join a farm.
            {issued.shortTicketExpires
              ? ` Stops working ${new Date(issued.shortTicketExpires).toLocaleDateString()}.`
              : null}
          </p>
        </div>
      )}

      <div className="text-[10px] text-slate-400 leading-snug space-y-1 border-t border-slate-100 pt-2">
        <p>
          Read from {shelf ? <code className="font-mono">{shelf}</code> : 'this computer'}. Tickets
          you handed out from a <strong>different</strong> laptop are on that laptop&apos;s list.
        </p>
        <p>
          Revoking stops the ticket working for anyone new. A device that already pulled the farm
          keeps its copy — the only way to shut that out is a new FarmCode. A recovery code is a
          new invite, not a kick.
        </p>
      </div>
    </div>
  );
}
