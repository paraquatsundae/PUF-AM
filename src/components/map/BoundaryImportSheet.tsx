/**
 * Import paddock boundaries from JD Ops Center ISOXML (TASKDATA.XML / zip) or KML.
 */
import React, { useMemo, useState } from 'react';
import { CheckCircle2, FileUp, Loader2, X } from 'lucide-react';
import {
  applyIsoxmlImport,
  applyKmlImport,
  summarizeIsoxml,
  type FarmImportResult,
  type ImportConflictMode,
  type ImportProgress,
} from '../../lib/import/applyBoundaryImport';
import {
  describeEmptyIsoxml,
  flattenIsoxmlFarms,
  parseIsoxmlTaskDataWithStats,
} from '../../lib/import/isoxmlBoundaries';
import { parseKmlFields } from '../../lib/import/kmlBoundaries';
import { loadImportFile } from '../../lib/import/readTaskDataFile';
import type { OrchardBlock } from '../../lib/mapStore';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called after a successful import so the map can reload / fit bounds. */
  onImported?: (summary: { currentAdded: number; otherFarms: number }) => void | Promise<void>;
  currentFarmId: string;
  currentFarmName: string;
  onCurrentFarmBlock: (block: OrchardBlock) => Promise<void>;
  onCurrentFarmDelete?: (id: string) => Promise<void>;
};

type Preview =
  | {
      kind: 'isoxml';
      summary: string;
      farmCount: number;
      fieldCount: number;
      sourceName: string;
      tree: ReturnType<typeof parseIsoxmlTaskDataWithStats>['tree'];
    }
  | {
      kind: 'kml';
      summary: string;
      fieldCount: number;
      sourceName: string;
      fields: ReturnType<typeof parseKmlFields>;
    };

type Phase = 'idle' | 'reading' | 'parsing' | 'ready' | 'importing' | 'done';

function yieldUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function formatImportSummary(results: FarmImportResult[]): {
  headline: string;
  detail: string;
  currentAdded: number;
  otherFarms: number;
} {
  const currentAdded = results.filter((r) => r.intoCurrent).reduce((n, r) => n + r.added, 0);
  const other = results.filter((r) => !r.intoCurrent && r.added > 0);
  const otherFarms = other.length;
  const otherPaddocks = other.reduce((n, r) => n + r.added, 0);
  const replaced = results.reduce((n, r) => n + r.replaced, 0);

  const headline =
    currentAdded > 0
      ? `Imported ${currentAdded} paddock${currentAdded === 1 ? '' : 's'}`
      : otherFarms > 0
        ? `Imported ${otherPaddocks} paddock${otherPaddocks === 1 ? '' : 's'} on other farms`
        : 'Nothing imported';

  const lines: string[] = [];
  for (const r of results) {
    if (!r.added && !r.replaced) continue;
    if (r.intoCurrent) {
      lines.push(`This farm (“${r.farmName}”): +${r.added}${r.replaced ? `, replaced ${r.replaced}` : ''}`);
    } else {
      lines.push(
        `New farm “${r.farmName}”: +${r.added} (switch farm later to open)`
      );
    }
  }
  if (replaced && !lines.some((l) => l.includes('replaced'))) {
    lines.push(`Replaced ${replaced} matching name(s)`);
  }
  if (otherFarms > 0 && currentAdded > 0) {
    lines.push(
      `${otherFarms} other farm${otherFarms === 1 ? '' : 's'} created with ${otherPaddocks} paddock${otherPaddocks === 1 ? '' : 's'}.`
    );
  }

  return {
    headline,
    detail: lines.join('\n') || 'No paddocks were written.',
    currentAdded,
    otherFarms,
  };
}

export function BoundaryImportSheet({
  open,
  onClose,
  onImported,
  currentFarmId,
  currentFarmName,
  onCurrentFarmBlock,
  onCurrentFarmDelete,
}: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [conflict, setConflict] = useState<ImportConflictMode>('keepBoth');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultHeadline, setResultHeadline] = useState<string | null>(null);
  const [resultDetail, setResultDetail] = useState<string | null>(null);

  const busy = phase === 'reading' || phase === 'parsing' || phase === 'importing';

  const detailLines = useMemo(() => {
    if (!preview) return [];
    if (preview.kind === 'isoxml') {
      return flattenIsoxmlFarms(preview.tree).map(
        (f) => `${f.name}: ${f.fields.length} paddock${f.fields.length === 1 ? '' : 's'}`
      );
    }
    return preview.fields.map((f) => `${f.name} (${f.areaHa} ha)`);
  }, [preview]);

  const resetAndClose = () => {
    setPreview(null);
    setProgress(null);
    setError(null);
    setResultHeadline(null);
    setResultDetail(null);
    setPhase('idle');
    onClose();
  };

  if (!open) return null;

  const onFile = async (file: File) => {
    setError(null);
    setResultHeadline(null);
    setResultDetail(null);
    setPreview(null);
    setProgress(null);
    setPhase('reading');
    await yieldUi();
    try {
      const loaded = await loadImportFile(file);
      setPhase('parsing');
      setProgress({
        phase: 'preparing',
        current: 0,
        total: 1,
        message: `Parsing ${loaded.sourceName}…`,
      });
      await yieldUi();

      if (loaded.kind === 'kml') {
        const fields = parseKmlFields(loaded.text);
        if (!fields.length) throw new Error('No polygon paddocks found in KML');
        setPreview({
          kind: 'kml',
          summary: `${fields.length} paddock${fields.length === 1 ? '' : 's'} → current farm`,
          fieldCount: fields.length,
          sourceName: loaded.sourceName,
          fields,
        });
        setPhase('ready');
        setProgress(null);
        return;
      }

      const { tree, stats } = parseIsoxmlTaskDataWithStats(loaded.text);
      const farms = flattenIsoxmlFarms(tree);
      const fieldCount = farms.reduce((n, f) => n + f.fields.length, 0);
      if (!fieldCount) throw new Error(describeEmptyIsoxml(stats));
      setPreview({
        kind: 'isoxml',
        summary: summarizeIsoxml(tree),
        farmCount: farms.length,
        fieldCount,
        sourceName: loaded.sourceName,
        tree,
      });
      setPhase('ready');
      setProgress(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('idle');
      setProgress(null);
    }
  };

  const runImport = async () => {
    if (!preview) return;
    if (!currentFarmId?.trim()) {
      setError('No active farm — open a farm map before importing.');
      return;
    }
    setPhase('importing');
    setError(null);
    setResultHeadline(null);
    setResultDetail(null);
    setProgress({
      phase: 'preparing',
      current: 0,
      total: preview.fieldCount,
      message: 'Starting import…',
    });
    await yieldUi();
    try {
      let summary: ReturnType<typeof formatImportSummary>;
      if (preview.kind === 'isoxml') {
        const results = await applyIsoxmlImport({
          tree: preview.tree,
          currentFarmId,
          currentFarmName,
          conflict,
          onCurrentFarmBlock,
          onCurrentFarmDelete,
          onProgress: setProgress,
        });
        summary = formatImportSummary(results);
      } else {
        const r = await applyKmlImport({
          fields: preview.fields,
          currentFarmId,
          conflict,
          onCurrentFarmBlock,
          onCurrentFarmDelete,
          onProgress: setProgress,
        });
        summary = formatImportSummary([r]);
      }
      setResultHeadline(summary.headline);
      setResultDetail(summary.detail);
      setPhase('done');
      setProgress({
        phase: 'done',
        current: preview.fieldCount,
        total: preview.fieldCount,
        message: summary.headline,
      });
      try {
        await onImported?.({
          currentAdded: summary.currentAdded,
          otherFarms: summary.otherFarms,
        });
      } catch (reloadErr) {
        console.warn('[BoundaryImportSheet] post-import map refresh failed', reloadErr);
        setError(
          'Import saved, but the map failed to refresh. Close and reopen the farm map if paddocks are missing.'
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase(preview ? 'ready' : 'idle');
      setProgress(null);
    }
  };

  const statusLabel =
    phase === 'reading'
      ? 'Reading file…'
      : phase === 'parsing'
        ? progress?.message || 'Parsing…'
        : phase === 'importing'
          ? progress?.message || 'Importing…'
          : null;

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={busy ? undefined : resetAndClose}
      />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900">Import boundaries</h3>
            <p className="text-xs text-slate-500">John Deere Ops Center ISOXML / zip or KML</p>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            disabled={busy}
            className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-40"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {phase !== 'done' && (
            <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-8 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/40">
              <FileUp className="w-8 h-8 text-indigo-600" />
              <span className="text-sm font-semibold text-slate-800">
                Choose TASKDATA.XML, .zip, or .kml
              </span>
              <span className="text-[11px] text-slate-500 text-center max-w-sm">
                Preferred: zip the whole Ops Center Taskdata folder (includes TASKDATA.XML). Single XML works when
                paddock polygons are inline.
              </span>
              <input
                type="file"
                accept=".xml,.XML,.zip,.ZIP,.kml,.KML,text/xml,application/xml,application/zip"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                  e.target.value = '';
                }}
              />
            </label>
          )}

          {statusLabel && (
            <div className="flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <div className="min-w-0">
                <div className="font-medium">{statusLabel}</div>
                {phase === 'importing' && progress && progress.total > 0 && (
                  <div className="text-[11px] text-indigo-700 mt-0.5">
                    {progress.current} / {progress.total}
                    <div className="mt-1 h-1.5 rounded-full bg-indigo-100 overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 transition-all"
                        style={{
                          width: `${Math.min(100, Math.round((100 * progress.current) / progress.total))}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {phase === 'done' && resultHeadline && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 space-y-2">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-base font-bold text-emerald-900">{resultHeadline}</div>
                  {resultDetail && (
                    <div className="text-sm text-emerald-800 mt-2 whitespace-pre-wrap">{resultDetail}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {preview && phase !== 'done' && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="text-sm font-semibold text-slate-800">{preview.summary}</div>
              <div className="text-[11px] text-slate-500 truncate" title={preview.sourceName}>
                Source: {preview.sourceName}
              </div>
              <ul className="text-xs text-slate-600 space-y-0.5 max-h-36 overflow-y-auto">
                {detailLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {preview.kind === 'isoxml' && (
                <p className="text-[11px] text-slate-500">
                  Farms whose name matches <strong>{currentFarmName || 'this farm'}</strong> (or a
                  single-farm file) land on the map now. If none match, the largest farm lands here;
                  other farms are created under your account.
                </p>
              )}
            </div>
          )}

          {phase !== 'done' && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                If paddock names already exist
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConflict('keepBoth')}
                  disabled={busy}
                  className={`flex-1 text-xs font-semibold rounded-xl px-3 py-2 border ${
                    conflict === 'keepBoth'
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  Keep both
                </button>
                <button
                  type="button"
                  onClick={() => setConflict('replaceMatching')}
                  disabled={busy}
                  className={`flex-1 text-xs font-semibold rounded-xl px-3 py-2 border ${
                    conflict === 'replaceMatching'
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  Replace matching
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2 whitespace-pre-wrap">
              {error}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
          {phase === 'done' ? (
            <button
              type="button"
              onClick={resetAndClose}
              className="px-5 py-2 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={resetAndClose}
                disabled={busy}
                className="px-4 py-2 text-sm font-medium rounded-xl text-slate-600 hover:bg-slate-200 disabled:opacity-40"
              >
                Close
              </button>
              <button
                type="button"
                disabled={!preview || busy}
                onClick={() => void runImport()}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                {phase === 'importing' && <Loader2 className="w-4 h-4 animate-spin" />}
                Import
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
