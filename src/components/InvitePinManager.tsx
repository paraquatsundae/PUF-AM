import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Loader2, Plus, Ban, Copy, Check, Share2 } from 'lucide-react';
import {
  MODULE_LABELS,
  WALNUT_PACK_MODULES,
  WORK_MODULES,
  clampModulesToFarm,
  presetsForFarm,
  type FarmModuleId,
  type ModulePreset,
} from '../../shared/auth/farmModules';
import {
  createInvitePin,
  listInvitePins,
  revokeInvitePin,
  type PinRole,
} from '../lib/invitePinAuth';
import { useAuth } from '../contexts/AuthContext';
import { isByoFirebase } from '../lib/byoFirebaseConfig';
import { APP_INVITE_SUBJECT } from '../brand';
import { useWalnutPack } from '../hooks/useWalnutPack';

function shareMessage(
  code: string,
  role: PinRole,
  extra?: { farmId?: string; byo?: boolean }
): string {
  const steps = extra?.byo
    ? [
        '1. Cloud sync → Your own Firebase and paste the same project config',
        `2. Join a farm — farm ID ${extra.farmId || '(ask the owner)'}`,
        '3. Enter your name (use the same name next time)',
        `4. Enter this PIN: ${code}`,
      ]
    : [
        '1. Open the app and go to Sign in → Join a farm',
        '2. Enter your name (use the same name next time)',
        `3. Enter this PIN: ${code}`,
      ];
  return [
    APP_INVITE_SUBJECT,
    '',
    ...steps,
    '',
    `Role: ${role}`,
    'Same name + PIN reopens your account on this farm.',
  ].join('\n');
}

function ModuleChecklist({
  selected,
  onChange,
  disabled,
  available,
}: {
  selected: FarmModuleId[];
  onChange: (next: FarmModuleId[]) => void;
  disabled?: boolean;
  available: FarmModuleId[];
}) {
  const toggle = (id: FarmModuleId) => {
    if (selected.includes(id)) {
      onChange(selected.filter((m) => m !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      {available.map((id) => (
        <label
          key={id}
          className="flex items-center gap-2 text-xs text-slate-700 px-2 py-1.5 rounded-lg border border-slate-100 bg-slate-50/80"
        >
          <input
            type="checkbox"
            checked={selected.includes(id)}
            disabled={disabled}
            onChange={() => toggle(id)}
            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          {MODULE_LABELS[id]}
        </label>
      ))}
    </div>
  );
}

export function InvitePinManager({ onCreated }: { onCreated?: () => void }) {
  const { farmEnabledModules, userData } = useAuth();
  const hasWalnutPack = useWalnutPack();
  const packExclude = useMemo(
    () => (hasWalnutPack ? ([] as FarmModuleId[]) : [...WALNUT_PACK_MODULES]),
    [hasWalnutPack]
  );
  const grantCatalog = useMemo(
    () => farmEnabledModules.filter((m) => !packExclude.includes(m)),
    [farmEnabledModules, packExclude]
  );
  const farmPresets = useMemo(
    () => presetsForFarm(farmEnabledModules, { excludeModules: packExclude }),
    [farmEnabledModules, packExclude]
  );

  const [pins, setPins] = useState<Awaited<ReturnType<typeof listInvitePins>>>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshCode, setFreshCode] = useState<string | null>(null);
  const [freshRole, setFreshRole] = useState<PinRole>('farmer');
  const [copied, setCopied] = useState<'code' | 'share' | null>(null);
  const [label, setLabel] = useState('Season worker');
  const [role, setRole] = useState<PinRole>('farmer');
  const [modules, setModules] = useState<FarmModuleId[]>(() =>
    clampModulesToFarm(WORK_MODULES, grantCatalog)
  );
  const [maxUses, setMaxUses] = useState<string>('');
  const [days, setDays] = useState('365');
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    setModules((prev) => {
      const next = clampModulesToFarm(prev.length ? prev : WORK_MODULES, grantCatalog);
      if (next.length) return next;
      return clampModulesToFarm(WORK_MODULES, grantCatalog);
    });
  }, [grantCatalog]);

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
    modules: FarmModuleId[];
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
    if (role !== 'admin' && modules.length === 0) {
      setError('Select at least one module.');
      return;
    }
    await mint({
      role,
      label: label.trim() || 'Invite',
      modules: role === 'admin' ? [...grantCatalog] : modules,
      maxUses: maxUses.trim() === '' ? null : Number(maxUses),
      expiresInDays: days.trim() === '' ? null : Number(days),
    });
  };

  const onPreset = async (preset: ModulePreset) => {
    setLabel(preset.pinLabel);
    setRole(preset.role);
    setModules([...preset.modules]);
    setDays(preset.days == null ? '' : String(preset.days));
    setMaxUses(preset.maxUses == null ? '' : String(preset.maxUses));
    await mint({
      role: preset.role,
      label: preset.pinLabel,
      modules: [...preset.modules],
      maxUses: preset.maxUses,
      expiresInDays: preset.days,
    });
  };

  const onRevoke = async (pinId: string) => {
    if (
      !confirm(
        'Revoke this invite PIN? New joins and return logins with this PIN will fail. Already signed-in users stay until you remove them from the team.'
      )
    ) {
      return;
    }
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
    await navigator.clipboard.writeText(
      shareMessage(freshCode, freshRole, {
        farmId: userData?.farmId,
        byo: isByoFirebase(),
      })
    );
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
            Create a code with role + modules, share it with staff. They join with name + PIN.
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
          {farmPresets.map((preset) => (
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
              <label className="text-xs font-medium text-slate-600">
                Name / label (shown in Active & past PINs)
              </label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Sam — season worker"
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
                <option value="viewer">Viewer (read-only)</option>
                <option value="farmer">Farmer (can edit)</option>
                <option value="admin">Admin (full + team)</option>
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

          {role !== 'admin' && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600">Modules</p>
              <ModuleChecklist
                selected={modules}
                onChange={setModules}
                disabled={creating}
                available={grantCatalog}
              />
            </div>
          )}

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
        <p className="text-xs text-slate-500">
          Each row shows the name/label set when that PIN was created (and who last used it, if known).
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : pins.length === 0 ? (
          <p className="text-sm text-slate-500">No PINs yet. Use a quick-create button above.</p>
        ) : (
          <ul className="space-y-2">
            {pins.map((p) => {
              const pinName =
                (p.label && p.label.trim()) ||
                `${p.role} · ${(p.createdAt || '').slice(0, 10) || 'invite'}`;
              return (
              <li
                key={p.pinId}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate" title={pinName}>
                    {pinName}
                  </p>
                  <p className="text-xs text-slate-500">
                    <span className="capitalize">{p.role}</span>
                    {' · '}
                    {p.codeHint || '••••'}
                    {' · '}
                    uses {p.useCount}
                    {p.maxUses != null ? `/${p.maxUses}` : ''}
                    {p.createdAt ? ` · created ${p.createdAt.slice(0, 10)}` : ''}
                    {p.expiresAt ? ` · exp ${p.expiresAt.slice(0, 10)}` : ''}
                    {!p.active ? ' · revoked' : ''}
                  </p>
                  {p.lastRedeemedDisplayName ? (
                    <p className="text-xs text-emerald-800 mt-0.5 truncate">
                      Used by {p.lastRedeemedDisplayName}
                      {p.lastRedeemedAt ? ` · ${p.lastRedeemedAt.slice(0, 10)}` : ''}
                    </p>
                  ) : p.useCount > 0 ? (
                    <p className="text-[11px] text-slate-400 mt-0.5">Redeemed (name not recorded)</p>
                  ) : (
                    <p className="text-[11px] text-slate-400 mt-0.5">Not used yet</p>
                  )}
                  {p.modules?.length > 0 && (
                    <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                      {p.modules.map((m) => MODULE_LABELS[m] || m).join(' · ')}
                    </p>
                  )}
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
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
