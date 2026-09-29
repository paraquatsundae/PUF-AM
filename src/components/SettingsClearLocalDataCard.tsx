/**
 * Settings → General. Deletes pufom_farm_local on this device and reloads.
 * Used while the local schema is being fixed: a rejected database cannot be opened,
 * so wiping rows inside it is not enough.
 */
import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { deleteLocalFarmDatabase } from '../lib/clearLocalFarmDb';

export function SettingsClearLocalDataCard() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clear = () => {
    setBusy(true);
    setError(null);
    void deleteLocalFarmDatabase()
      .then(() => {
        window.location.reload();
      })
      .catch((err: unknown) => {
        setBusy(false);
        setError(err instanceof Error ? err.message : 'Could not clear local data.');
      });
  };

  return (
    <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <h2 className="text-lg font-bold text-slate-900">Local data</h2>
      <p className="text-sm text-slate-600 leading-relaxed">
        Removes this device&apos;s diary, issues, map highlights, and waiting uploads, then
        reloads. The farm in the cloud stays. Use this when the local database asks to be
        cleared before it will open again.
      </p>
      {error && !confirming ? (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
          {error}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-sm font-semibold hover:bg-rose-100"
      >
        <Trash2 className="w-4 h-4" />
        Clear local data
      </button>
      {confirming ? (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Cancel clear"
            disabled={busy}
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => {
              if (busy) return;
              setConfirming(false);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-local-data-title"
            className="relative w-full max-w-md rounded-2xl border border-rose-200 bg-white shadow-2xl p-5 space-y-3"
          >
            <h3 id="clear-local-data-title" className="text-base font-bold text-slate-900">
              Clear local data on this device?
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Diary entries, issues, map highlights, and uploads still waiting on this phone or
              computer will be deleted. This cannot be undone here. The farm stored in the cloud
              is not deleted. The page reloads after the clear.
            </p>
            {error ? (
              <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                {error}
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setConfirming(false);
                  setError(null);
                }}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={clear}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete local data
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
