import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, Plus, Ban, Copy, Check, Share2 } from 'lucide-react';
import {
  createInvitePin,
  listInvitePins,
  revokeInvitePin,
  type PinRole,
} from '../lib/invitePinAuth';

type Preset = {
  id: string;
  label: string;
  role: PinRole;
  pinLabel: string;
  days: number | null;
  maxUses: number | null;
  blurb: string;
};

const PRESETS: Preset[] = [
  {
    id: 'worker',
    label: 'Worker',
    role: 'farmer',
    pinLabel: 'Season worker',
    days: 365,
    maxUses: null,
    blurb: 'Can view and edit farm data',
  },
  {
    id: 'viewer',
    label: 'Viewer',
    role: 'viewer',
    pinLabel: 'Viewer',
    days: 365,
    maxUses: null,
    blurb: 'Read-only access',
  },
  {
    id: 'admin',
    label: 'Admin',
    role: 'admin',
    pinLabel: 'Farm admin',
    days: 365,
    maxUses: null,
    blurb: 'Full access + can mint PINs',
  },
  {
    id: 'oneday',
    label: 'One-day guest',
    role: 'viewer',
    pinLabel: 'Guest (1 day)',
    days: 1,
    maxUses: 5,
    blurb: 'Expires in 24 hours',
  },
];

function shareMessage(code: string, role: PinRole): string {
  return [
    'PUFOM farm invite',
    '',
    `1. Open the app and go to Sign in`,
    `2. Enter your name (use the same name next time)`,
    `3. Enter this PIN: ${code}`,
    '',
    `Role: ${role}`,
    'Same name + PIN reopens your account on this farm.',
  ].join('\n');
}

export function InvitePinManager({ onCreated }: { onCreated?: () => void }) {
  const [pins, setPins] = useState<Awaited<ReturnType<typeof listInvitePins>>>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshCode, setFreshCode] = useState<string | null>(null);
  const [freshRole, setFreshRole] = useState<PinRole>('farmer');
  const [copied, setCopied] = useState<'code' | 'share' | null>(null);
  const [label, setLabel] = useState('Season worker');
  const [role, setRole] = useState<PinRole>('farmer');
  const [maxUses, setMaxUses] = useState<string>('');
  const [days, setDays] = useState('365');
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  const mint = async (input: {
    role: PinRole;
    label: string;
    maxUses: number | null;
    expiresInDays: number | null;
  }) => {
    setCreating(true);
    setError(null);
    setFreshCode(null);
    try {
      const result = await createInvitePin(input);
      setFreshCode(result.code);
      setFreshRole(result.role);
      await refresh();
      onCreated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create PIN');
    } finally {
      setCreating(false);
    }
  };

  const onCreate = async () => {
    await mint({
      role,
      label: label.trim() || 'Invite',
      maxUses: maxUses.trim() === '' ? null : Number(maxUses),
      expiresInDays: days.trim() === '' ? null : Number(days),
    });
  };

  const onPreset = async (preset: Preset) => {
    setLabel(preset.pinLabel);
    setRole(preset.role);
    setDays(preset.days == null ? '' : String(preset.days));
    setMaxUses(preset.maxUses == null ? '' : String(preset.maxUses));
    await mint({
      role: preset.role,
      label: preset.pinLabel,
      maxUses: preset.maxUses,
      expiresInDays: preset.days,
    });
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
    setCopied('code');
    setTimeout(() => setCopied(null), 2000);
  };

  const copyShare = async () => {
    if (!freshCode) return;
    await navigator.clipboard.writeText(shareMessage(freshCode, freshRole));
    setCopied('share');
    setTimeout(() => setCopied(null), 2000);
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
            Create a code, share it with staff. They sign in with their name + PIN and join this farm.
          </p>
        </div>
      </div>

      {error && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</div>
      )}

      {freshCode && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            New PIN (copy now — shown once)
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-2xl tracking-widest text-emerald-950">{freshCode}</code>
            <button
              type="button"
              onClick={() => void copyCode()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-700 text-white text-sm"
            >
              {copied === 'code' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied === 'code' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => void copyShare()}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-800 hover:text-emerald-950"
          >
            {copied === 'share' ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
            {copied === 'share' ? 'Instructions copied' : 'Copy share message'}
          </button>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick create</p>
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={creating}
              onClick={() => void onPreset(preset)}
              className="text-left px-3 py-3 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 disabled:opacity-50 transition-colors"
            >
              <p className="text-sm font-semibold text-slate-900">{preset.label}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{preset.blurb}</p>
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        {showAdvanced ? 'Hide custom options' : 'Custom PIN options…'}
      </button>

      {showAdvanced && (
        <>
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
            Create custom PIN
          </button>
        </>
      )}

      {creating && !showAdvanced && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Creating PIN…
        </div>
      )}

      <div className="border-t border-slate-100 pt-4 space-y-2">
        <h3 className="text-sm font-semibold text-slate-800">Active & past PINs</h3>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : pins.length === 0 ? (
          <p className="text-sm text-slate-500">No PINs yet. Use a quick-create button above.</p>
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
