/**
 * Settings → Sync → **the one line an operator actually reads.**
 *
 * Everything below this card is a pipe with its own buttons, which is the right
 * way to explain the machinery and the wrong way to ask "is my farm on the other
 * device". This says which route is live, when the farm last moved and over
 * what, and offers one button that takes the best route available right now.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §9
 */

import React from 'react';
import { CheckCircle2, Loader2, RefreshCw, Radio, Wifi, WifiOff } from 'lucide-react';
import { clsx } from 'clsx';

import { describeLastSync } from '../../lib/autoSync';
import { useAutoSync } from './useAutoSync';

const ROUTE_ACTION: Record<string, string> = {
  'lan-sealed': 'Sync over Wi‑Fi',
  'lan-pufom': 'Sync over Wi‑Fi',
  'freenet-publish': 'Send over Freenet',
  'freenet-pull': 'Fetch over Freenet',
};

export function AutoSyncCard() {
  const sync = useAutoSync();
  if (!sync.farmId) return null;

  const { plan, last, busy, settling } = sync;
  const live = plan.route !== 'blocked';
  const wifi = plan.via === 'wifi';

  return (
    <div
      className={clsx(
        'p-6 rounded-2xl border shadow-sm space-y-4',
        live ? 'bg-white border-emerald-200' : 'bg-white border-slate-200',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={clsx(
            'p-2 rounded-xl',
            live ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500',
          )}
        >
          {settling || busy ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : !live ? (
            <WifiOff className="w-5 h-5" />
          ) : wifi ? (
            <Wifi className="w-5 h-5" />
          ) : (
            <Radio className="w-5 h-5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-900">Keeping devices in step</h2>
          <p className="text-sm text-slate-600">{plan.label}</p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
        {last?.ok ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        ) : null}
        <p
          className={clsx(
            'text-xs min-w-0',
            last && !last.ok ? 'text-amber-900' : 'text-slate-600',
          )}
        >
          {describeLastSync(last)}
        </p>
      </div>

      {plan.detail ? <p className="text-[11px] text-slate-500">{plan.detail}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || settling || !live}
          onClick={sync.syncNow}
          title={live ? undefined : plan.detail}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {ROUTE_ACTION[plan.route] ?? 'Sync now'}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => sync.refresh()}
          className="text-xs text-slate-500 hover:text-slate-800 underline disabled:opacity-50"
        >
          Look again
        </button>

        <label className="ml-auto flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={sync.autoEnabled}
            onChange={(e) => sync.setAuto(e.target.checked)}
            className="w-4 h-4 accent-emerald-700"
          />
          Sync by itself over Wi‑Fi
        </label>
      </div>

      <p className="text-[11px] text-slate-500">
        Automatic sync only ever uses Wi‑Fi, where both devices merge what each has and nothing is
        overwritten. Freenet moves a farm between devices that cannot see each other — it takes
        minutes and changes the join ticket, so it waits for you to press it.
      </p>
    </div>
  );
}
