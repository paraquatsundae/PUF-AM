/**
 * Farm setup banner: a new Freenet farm is local-only until Send.
 *
 * Does not publish. Skip leaves the farm on this computer on purpose.
 *
 * @see Plans/FREENET_HOLES.md hole 1
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Share2, X } from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';
import { isFreenetFarm } from '../lib/farmPipes';
import { fetchJoinTicketLedger } from '../lib/joinLedger';
import { FreenetHowItWorksButton } from './FreenetHowItWorks';

function dismissKey(farmId: string): string {
  return `pufam_freenet_send_nudge_dismissed:${farmId}`;
}

function wasDismissed(farmId: string): boolean {
  try {
    return localStorage.getItem(dismissKey(farmId)) === '1';
  } catch {
    return false;
  }
}

function rememberDismiss(farmId: string): void {
  try {
    localStorage.setItem(dismissKey(farmId), '1');
  } catch {
    /* ignore */
  }
}

export function FreenetSendNudge() {
  const { userData } = useAuth();
  const farmId = userData?.farmId;
  const [hidden, setHidden] = useState(() => !farmId || wasDismissed(farmId));

  useEffect(() => {
    if (!farmId || !isFreenetFarm() || wasDismissed(farmId)) {
      setHidden(true);
      return;
    }
    let cancelled = false;
    void fetchJoinTicketLedger(farmId)
      .then((ledger) => {
        if (!cancelled && ledger.rows.length > 0) setHidden(true);
      })
      .catch(() => {
        /* Hub missing or unread — still show the nudge. */
      });
    return () => {
      cancelled = true;
    };
  }, [farmId]);

  if (!farmId || !isFreenetFarm() || hidden) return null;

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Share2 className="w-4 h-4 text-violet-700 shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-slate-900">
              This farm is only on this computer
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">
              Nobody else can join until Settings → Sync → <strong>Send this farm</strong>. That
              puts a sealed copy on Freenet and mints a join ticket. Skip if it should stay local.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            rememberDismiss(farmId);
            setHidden(true);
          }}
          className="p-1 rounded-lg text-slate-500 hover:bg-violet-100 shrink-0"
          aria-label="Skip — keep this farm local"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-6">
        <Link
          to="/settings?tab=sync"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white px-2.5 py-1 rounded-lg bg-violet-700 hover:bg-violet-800"
        >
          Send this farm
        </Link>
        <button
          type="button"
          onClick={() => {
            rememberDismiss(farmId);
            setHidden(true);
          }}
          className="text-[11px] font-semibold text-slate-600 hover:text-slate-900"
        >
          Skip — keep it local
        </button>
        <FreenetHowItWorksButton />
      </div>
    </div>
  );
}
