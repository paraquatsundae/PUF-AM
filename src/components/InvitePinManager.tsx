import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, Plus, Ban, Copy, Check } from 'lucide-react';
import {
  createInvitePin,
  listInvitePins,
  revokeInvitePin,
  type PinRole,
} from '../lib/invitePinAuth';

export function InvitePinManager() {
  const [pins, setPins] = useState<Awaited<ReturnType<typeof listInvitePins>>>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshCode, setFreshCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [label, setLabel] = useState('Season worker');
  const [role, setRole] = useState<PinRole>('farmer');
  const [maxUses, setMaxUses] = useState<string>('');
  const [days, setDays] = useState('90');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPins(await listInvitePins());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load PINs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onCreate = async () => {
    setCreating(true);
    setError(null);
    setFreshCode(null);
    try {
      const result = await createInvitePin({
        role,
        label: label.trim() || 'Invite',
        maxUses: maxUses.trim() === '' ? null : Number(maxUses),
        expiresInDays: days.trim() === '' ? null : Number(days),
      });
      setFreshCode(result.code);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create PIN');
    } finally {
      setCreating(false);
    }
  };

  const onRevoke = async (pinId: string) => {
    if (!confirm('Revoke this invite PIN? Existing signed-in users stay until they log out.')) return;
    try {
      await revokeInvitePin(pinId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke');
    }
  };

  const copyCode = async () => {
    if (!freshCode) return;
    await navigator.clipboard.writeText(freshCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-emerald-50 rounded-xl">
          <KeyRound className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Invite PINs</h2>
          <p className="text-sm text-slate-500">
            Issue codes for staff to sign in without Google. Same name + PIN reopens the same account.
          </p>
        </div>
      </div>

      {error && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</div>
      )}

      {freshCode && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            New PIN (copy now — shown once)
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-xl tracking-widest text-emerald-950">{freshCode}</code>
            <button
              type="button"
              onClick={() => void copyCode()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-700 text-white text-sm"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Label</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as PinRole)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          >
            <option value="viewer">Viewer</option>
            <option value="farmer">Farmer</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Max uses (blank = unlimited)</label>
          <input
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            inputMode="numeric"
            placeholder="e.g. 5"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Expires in days (blank = never)</label>
          <input
            value={days}
            onChange={(e) => setDays(e.target.value)}
            inputMode="numeric"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>
      </div>

      <button
        type="button"
        disabled={creating}
        onClick={() => void onCreate()}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
      >
        {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        Create invite PIN
      </button>

      <div className="border-t border-slate-100 pt-4 space-y-2">
        <h3 className="text-sm font-semibold text-slate-800">Active & past PINs</h3>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : pins.length === 0 ? (
          <p className="text-sm text-slate-500">No PINs yet. Create one above, or seed with the bootstrap script.</p>
        ) : (
          <ul className="space-y-2">
            {pins.map((p) => (
              <li
                key={p.pinId}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {p.label}{' '}
                    <span className="text-slate-400 font-normal">({p.role})</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {p.codeHint || '••••'} · uses {p.useCount}
                    {p.maxUses != null ? `/${p.maxUses}` : ''}
                    {p.expiresAt ? ` · exp ${p.expiresAt.slice(0, 10)}` : ''}
                    {!p.active ? ' · revoked' : ''}
                  </p>
                </div>
                {p.active && (
                  <button
                    type="button"
                    onClick={() => void onRevoke(p.pinId)}
                    className="inline-flex items-center gap-1 text-xs text-rose-700 hover:text-rose-900 shrink-0"
                  >
                    <Ban className="w-3.5 h-3.5" /> Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
