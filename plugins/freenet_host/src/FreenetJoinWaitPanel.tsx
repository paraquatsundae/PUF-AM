/**
 * Join-screen Opennet wait — Listening / On Opennet, not a red flash at t=0.
 * Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-14 (Join waits for On Opennet).
 */

import { Loader2 } from 'lucide-react';

import type { FreenetJoinWaitView } from '../../../src/lib/freenetJoinWait.ts';

const TONE_CLASS: Record<FreenetJoinWaitView['tone'], string> = {
  wait: 'text-amber-900 bg-amber-50 border-amber-200',
  ok: 'text-emerald-800 bg-emerald-50 border-emerald-200',
  error: 'text-rose-700 bg-rose-50 border-rose-200',
};

export function FreenetJoinWaitPanel({ wait }: { wait: FreenetJoinWaitView }) {
  return (
    <div
      role="status"
      data-testid="freenet-join-wait"
      data-phase={wait.phase}
      data-tone={wait.tone}
      className={`text-sm rounded-xl border px-3 py-2.5 space-y-1 ${TONE_CLASS[wait.tone]}`}
    >
      <p className="font-medium inline-flex items-center gap-2">
        {wait.tone === 'wait' ? <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden /> : null}
        {wait.label}
      </p>
      {wait.detail ? <p className="text-xs opacity-90">{wait.detail}</p> : null}
    </div>
  );
}
