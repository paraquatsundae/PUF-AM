/**
 * Compact trail visibility toggles for operate map chrome.
 */
import React from 'react';
import { cn } from '../../lib/utils';
import type { BreadTrailPrefs } from '../../lib/breadTrails';

type Props = {
  prefs: BreadTrailPrefs;
  canEveryone: boolean;
  onChange: (next: BreadTrailPrefs) => void;
};

export function BreadTrailToggles({ prefs, canEveryone, onChange }: Props) {
  const chip = (
    label: string,
    on: boolean,
    disabled: boolean,
    toggle: () => void,
    title: string
  ) => (
    <button
      type="button"
      disabled={disabled}
      title={title}
      aria-pressed={on}
      onClick={toggle}
      className={cn(
        'px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-colors',
        disabled && 'opacity-40 cursor-not-allowed',
        on
          ? 'bg-teal-700 text-white border-teal-700'
          : 'bg-white/90 text-slate-600 border-slate-200 hover:border-teal-400'
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-1 pointer-events-auto bg-white/85 backdrop-blur rounded-lg border border-white/30 shadow-md px-1.5 py-1">
      <span className="text-[9px] font-bold uppercase text-slate-400 px-0.5">Trails</span>
      {chip('Mine', prefs.showMine, false, () => onChange({ ...prefs, showMine: !prefs.showMine }), 'Show my trail (last 2 min)')}
      {chip(
        'Machines',
        prefs.showMachines,
        false,
        () => onChange({ ...prefs, showMachines: !prefs.showMachines }),
        'Show machine / vehicle trails'
      )}
      {chip(
        'Everyone',
        prefs.showEveryone,
        !canEveryone,
        () => {
          if (!canEveryone) return;
          onChange({ ...prefs, showEveryone: !prefs.showEveryone });
        },
        canEveryone
          ? 'Show all crew trails'
          : 'Admin only — ask a farm admin to enable everyone’s trails'
      )}
    </div>
  );
}
