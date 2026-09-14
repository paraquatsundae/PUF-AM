/**
 * In-app Keep / Stop Freenet ask (Android Sign out / Leave farm).
 * Swipe-away cannot show a dialog; this is the session-leave substitute.
 * Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-14 (ask before cutting Freenet).
 */

import React from 'react';

import {
  FREENET_ATTACHED_LEAVE_BODY,
  FREENET_ATTACHED_LEAVE_BUTTON,
  FREENET_ATTACHED_LEAVE_TITLE,
  FREENET_QUIT_ASK_TITLE,
  FREENET_QUIT_KEEP_LABEL,
  FREENET_QUIT_MANAGED_DETAIL,
  FREENET_QUIT_STOP_LABEL,
  type FreenetQuitAskKind,
} from '../../units/puf-freenet-host/src/quit-ask.ts';
import type { FreenetLeaveAskState } from '../hooks/useFreenetLeaveAsk';

export function FreenetQuitAskDialog({
  kind,
  onKeep,
  onStop,
  onLeaveAttached,
}: {
  kind: Exclude<FreenetQuitAskKind, 'none'>;
  onKeep: () => void;
  onStop: () => void;
  onLeaveAttached: () => void;
}) {
  if (kind === 'attached') {
    return (
      <div
        className="fixed inset-0 z-[6000] flex items-end sm:items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="freenet-quit-ask-title"
        data-testid="freenet-quit-ask"
        data-kind="attached"
      >
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
          <h2 id="freenet-quit-ask-title" className="text-lg font-bold text-slate-900">
            {FREENET_ATTACHED_LEAVE_TITLE}
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">{FREENET_ATTACHED_LEAVE_BODY}</p>
          <button
            type="button"
            data-testid="freenet-quit-leave-attached"
            onClick={onLeaveAttached}
            className="w-full px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold"
          >
            {FREENET_ATTACHED_LEAVE_BUTTON}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[6000] flex items-end sm:items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="freenet-quit-ask-title"
      data-testid="freenet-quit-ask"
      data-kind="managed"
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
        <h2 id="freenet-quit-ask-title" className="text-lg font-bold text-slate-900">
          {FREENET_QUIT_ASK_TITLE}
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed">{FREENET_QUIT_MANAGED_DETAIL}</p>
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button
            type="button"
            data-testid="freenet-quit-stop"
            onClick={onStop}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-800 text-sm font-semibold"
          >
            {FREENET_QUIT_STOP_LABEL}
          </button>
          <button
            type="button"
            data-testid="freenet-quit-keep"
            autoFocus
            onClick={onKeep}
            className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold"
          >
            {FREENET_QUIT_KEEP_LABEL}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FreenetLeaveAskOverlay({
  ask,
  keepRunning,
  stopFreenet,
  leaveAttached,
}: {
  ask: FreenetLeaveAskState | null;
  keepRunning: () => void;
  stopFreenet: () => void;
  leaveAttached: () => void;
}) {
  if (!ask) return null;
  return (
    <FreenetQuitAskDialog
      kind={ask.kind}
      onKeep={keepRunning}
      onStop={stopFreenet}
      onLeaveAttached={leaveAttached}
    />
  );
}
