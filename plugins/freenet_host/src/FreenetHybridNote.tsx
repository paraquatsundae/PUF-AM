/**
 * The hybrid branches of the Freenet sync card, kept out of `MistFarmSyncCard`
 * (which is already over the size line) — Plans/FREENET_NETWORK_PACK.md §3.
 *
 * Two readers:
 *  - a **member** device: says what Send does for a cloud farm — seals what this
 *    device has loaded, no Firestore read — and repeats the plan's Hole 4;
 *  - a **mirror** device: the read-only banner, and the one recovery button —
 *    save the mirror as a `.pufom` that the existing Files & backup import takes
 *    into a new farm. No new importer; the pack is stamped with the cloud farm
 *    id so restoring the original farm needs no override at all.
 */

import React, { useState } from 'react';
import { Download, Eye, Loader2 } from 'lucide-react';

import { getLastFarm } from '../../../src/lib/deviceSession';
import { downloadBytes, exportPufomFile } from '../../../src/lib/pufomSync';
import type { FreenetHybridContext } from './useFreenetHybrid.ts';

export function FreenetHybridNote({ hybrid }: { hybrid: FreenetHybridContext }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveMirrorPack = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const { bytes, filename } = await exportPufomFile(hybrid.mistFarmId, {
        farmName: getLastFarm()?.farmName,
        asFarmId: hybrid.cloudFarmId,
      });
      downloadBytes(bytes, filename);
      setMessage(
        `Saved ${filename} (${Math.round(bytes.length / 1024)} KB). To rebuild the farm somewhere ` +
          'new: create the farm, then Settings → Sync → Files & backup → Import farm pack, ticking ' +
          '“the pack came from another farm”.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the mirror as a farm pack');
    } finally {
      setBusy(false);
    }
  };

  if (hybrid.mirror) {
    return (
      <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5">
        <p className="text-xs text-sky-950 flex items-start gap-2">
          <Eye className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <strong>This is a mirror of a cloud farm.</strong> To edit, join with an invite PIN.
            Fetching below replaces this copy with the owner&apos;s last Send.
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveMirrorPack()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-sky-300 bg-white text-sky-900 text-[11px] font-semibold disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Import into a new farm — save as farm pack
          </button>
          <span className="text-[10px] text-sky-800">
            If the cloud farm is ever lost, this file is the way back.
          </span>
        </div>
        {message && <p className="text-[11px] text-sky-900">{message}</p>}
        {error && <p className="text-[11px] text-rose-700">{error}</p>}
      </div>
    );
  }

  return (
    <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 leading-relaxed">
      <strong className="text-slate-800">Freenet mirror of a cloud farm.</strong> The cloud copy
      stays the one that counts. <strong>Send</strong> seals what this device has already loaded —
      recent diary, issues and the map — under the mirror&apos;s key and publishes it, without
      reading anything more from the cloud. Anyone holding the FarmCode can read the whole mirror
      whatever their cloud role, and revoking a ticket does not take a copy back.
    </p>
  );
}
