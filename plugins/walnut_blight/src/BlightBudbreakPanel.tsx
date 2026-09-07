/**
 * Production Ji budbreak date (BV-05) — lives on Blight Risk for farm admins.
 * Writes `budbreakMonth` / `budbreakDay` into farms/{id}/settings/model_params with merge.
 *
 * Budbreak opens Ji's 4-week primary-inoculum window, so moving it moves the only
 * part of the season where overwintered bud inoculum can start an epidemic.
 */
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../../src/firebase';
import { handleFirestoreError, OperationType } from '../../../src/lib/firestoreErrors';
import {
  DEFAULT_SH_BUDBREAK,
  JI_INOCULUM_WINDOW_DAYS,
  resolveBudbreak,
  type BudbreakDay,
} from '../../../shared/weather/jiBlightModel';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Days in `month` (0-indexed) using a non-leap year, so 29 Feb is never offered. */
function daysInMonth(month: number) {
  return new Date(2001, month + 1, 0).getDate();
}

function formatWindowEnd({ month, day }: BudbreakDay) {
  const end = new Date(2001, month, day + JI_INOCULUM_WINDOW_DAYS);
  return `${end.getDate()} ${MONTHS[end.getMonth()].slice(0, 3)}`;
}

export type BlightBudbreakPanelProps = {
  farmId: string | undefined;
  month: number | undefined;
  day: number | undefined;
  /** Optimistic local update so charts refresh before the snapshot round-trips. */
  onBudbreakChange: (next: BudbreakDay) => void;
  canEdit: boolean;
};

export function BlightBudbreakPanel({
  farmId,
  month,
  day,
  onBudbreakChange,
  canEdit,
}: BlightBudbreakPanelProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = resolveBudbreak(month, day);
  const isDefault =
    active.month === DEFAULT_SH_BUDBREAK.month && active.day === DEFAULT_SH_BUDBREAK.day;

  const save = async (next: BudbreakDay) => {
    if (!canEdit || !farmId || saving) return;
    if (next.month === active.month && next.day === active.day) return;
    setSaving(true);
    setError(null);
    onBudbreakChange(next);
    try {
      await setDoc(
        doc(db, 'farms', farmId, 'settings', 'model_params'),
        { budbreakMonth: next.month, budbreakDay: next.day },
        { merge: true }
      );
    } catch (err) {
      onBudbreakChange(active);
      setError('Could not save budbreak. Check you are signed in as a farm admin.');
      try {
        handleFirestoreError(err, OperationType.WRITE, `farms/${farmId}/settings/model_params`);
      } catch {
        // already logged
      }
    } finally {
      setSaving(false);
    }
  };

  // Clamp the day when a shorter month is picked (e.g. 31 Oct → 30 Nov).
  const onMonthChange = (nextMonth: number) =>
    void save({ month: nextMonth, day: Math.min(active.day, daysInMonth(nextMonth)) });

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Budbreak date</h2>
          <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5 max-w-xl">
            Opens Ji's {JI_INOCULUM_WINDOW_DAYS}-day primary-inoculum window (rain to{' '}
            {formatWindowEnd(active)} mobilises overwintered bud inoculum). Chandler in the SW is
            late-leafing — 1 October unless your own records say otherwise.
          </p>
        </div>
        {saving && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500">
            <Loader2 className="w-3 h-3 animate-spin" /> Saving
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Budbreak month"
          value={active.month}
          disabled={!canEdit || saving}
          onChange={(e) => onMonthChange(Number(e.target.value))}
          className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-bold text-slate-800 disabled:cursor-not-allowed disabled:opacity-80"
        >
          {MONTHS.map((label, idx) => (
            <option key={label} value={idx}>
              {label}
            </option>
          ))}
        </select>

        <select
          aria-label="Budbreak day"
          value={active.day}
          disabled={!canEdit || saving}
          onChange={(e) => void save({ month: active.month, day: Number(e.target.value) })}
          className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-bold text-slate-800 disabled:cursor-not-allowed disabled:opacity-80"
        >
          {Array.from({ length: daysInMonth(active.month) }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        {isDefault && (
          <span className="text-[10px] font-medium text-slate-400">Default</span>
        )}
      </div>

      {!canEdit && (
        <p className="text-[10px] text-slate-400">
          Farm admins can change this. Current value is shown read-only.
        </p>
      )}
      {error && <p className="text-[11px] text-rose-600 font-medium">{error}</p>}
    </div>
  );
}
