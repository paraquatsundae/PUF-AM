import React from 'react';

import { noteFor, type FarmSync, type SyncZone } from './useFarmSync';

/** The result of the last action taken in this card, and nothing from the others. */
export function SyncNote({ sync, zone }: { sync: FarmSync; zone: SyncZone }) {
  const note = noteFor(sync, zone);
  if (!note) return null;
  return (
    <div
      className={
        note.tone === 'error'
          ? 'text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2'
          : 'text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2'
      }
    >
      {note.text}
    </div>
  );
}
