/**
 * Settings → Sync → **Files & backup**, collapsed by default.
 *
 * Everything here is a file on this device: the `.pufom` pack that moves a farm
 * by USB stick, the human-readable JSON/Excel export, and the offline weather
 * cache. None of it is a pipe, none of it is urgent, and all of it used to sit
 * between the operator and the sync buttons they actually came for.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §2
 */

import React, { useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Download, FolderArchive, HardDriveDownload, Loader2, Upload } from 'lucide-react';

import { SyncNote } from './SyncNote';
import type { FarmSync } from './useFarmSync';

export function FilesBackupCard({ sync }: { sync: FarmSync }) {
  const [open, setOpen] = useState(false);
  const [includePhotos, setIncludePhotos] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { busy, weatherMeta } = sync;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-6 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="p-2 bg-indigo-50 rounded-xl">
          <FolderArchive className="w-5 h-5 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-900">Files & backup</h2>
          <p className="text-sm text-slate-500">
            Save the farm to a file, load one from a USB stick, or keep weather on this device.
          </p>
        </div>
        {open ? (
          <ChevronUp className="w-5 h-5 text-slate-400 shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-6 pb-6 space-y-4 border-t border-slate-100 pt-4">
          <SyncNote sync={sync} zone="files" />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => sync.exportPack()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
            >
              {busy === 'export' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Export farm pack
            </button>

            <button
              type="button"
              disabled={!!busy}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === 'import' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Import farm pack
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".pufom,application/octet-stream"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) sync.importPack(file);
              }}
            />
          </div>
          <p className="text-[11px] text-slate-500">
            A farm pack is a single compressed <code className="text-[11px]">.pufom</code> file —
            the same thing Wi‑Fi push and pull move, but carried by hand.
          </p>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">Spreadsheet export</p>
              <p className="text-xs text-slate-500 mt-1">
                Human-readable <code className="text-[11px]">farm-export.json</code> for
                spreadsheets and archives — not the compressed pack above.
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={includePhotos}
                onChange={(e) => setIncludePhotos(e.target.checked)}
                className="rounded border-slate-300"
              />
              Include compressed issue photos in zip sidecar
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!!busy}
                onClick={() => sync.exportJson()}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                {busy === 'export-json' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Export JSON
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => sync.exportXlsx()}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                {busy === 'export-xlsx' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Download Excel
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => sync.exportZip(includePhotos)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-indigo-200 text-indigo-900 text-sm font-medium hover:bg-indigo-50 disabled:opacity-50"
              >
                {busy === 'export-zip' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Export zip
              </button>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-800">Offline weather</p>
                <p className="text-xs text-slate-500">
                  {weatherMeta
                    ? `${weatherMeta.stationCode} · ${weatherMeta.dayCount} days · ${new Date(weatherMeta.updatedAt).toLocaleString()}`
                    : 'No station pack on this device yet'}
                </p>
              </div>
              <button
                type="button"
                disabled={!!busy || !sync.online}
                onClick={() => sync.cacheWeather()}
                className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                {busy === 'weather' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <HardDriveDownload className="w-4 h-4" />
                )}
                Cache weather
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
