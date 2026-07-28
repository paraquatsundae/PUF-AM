/**
 * Import paddock boundaries from JD Ops Center ISOXML (TASKDATA.XML) or KML.
 */
import React, { useMemo, useState } from 'react';
import { FileUp, Loader2, X } from 'lucide-react';
import {
  applyIsoxmlImport,
  applyKmlImport,
  summarizeIsoxml,
  type ImportConflictMode,
} from '../../lib/import/applyBoundaryImport';
import { flattenIsoxmlFarms, looksLikeTaskDataXml, parseIsoxmlTaskData } from '../../lib/import/isoxmlBoundaries';
import { parseKmlFields } from '../../lib/import/kmlBoundaries';
import type { OrchardBlock } from '../../lib/mapStore';

type Props = {
  open: boolean;
  onClose: () => void;
  currentFarmId: string;
  currentFarmName: string;
  onCurrentFarmBlock: (block: OrchardBlock) => Promise<void>;
};

type Preview =
  | { kind: 'isoxml'; summary: string; farmCount: number; fieldCount: number; tree: ReturnType<typeof parseIsoxmlTaskData> }
  | { kind: 'kml'; summary: string; fieldCount: number; fields: ReturnType<typeof parseKmlFields> };

export function BoundaryImportSheet({
  open,
  onClose,
  currentFarmId,
  currentFarmName,
  onCurrentFarmBlock,
}: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [conflict, setConflict] = useState<ImportConflictMode>('keepBoth');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultText, setResultText] = useState<string | null>(null);

  const detailLines = useMemo(() => {
    if (!preview) return [];
    if (preview.kind === 'isoxml') {
      return flattenIsoxmlFarms(preview.tree).map(
        (f) => `${f.name}: ${f.fields.length} paddock${f.fields.length === 1 ? '' : 's'}`
      );
    }
    return preview.fields.map((f) => `${f.name} (${f.areaHa} ha)`);
  }, [preview]);

  if (!open) return null;

  const onFile = async (file: File) => {
    setError(null);
    setResultText(null);
    setPreview(null);
    try {
      const name = file.name.toLowerCase();
      const text = await file.text();
      if (name.endsWith('.kml') || text.includes('<kml')) {
        const fields = parseKmlFields(text);
        if (!fields.length) throw new Error('No polygon paddocks found in KML');
        setPreview({
          kind: 'kml',
          summary: `${fields.length} paddock${fields.length === 1 ? '' : 's'} → current farm`,
          fieldCount: fields.length,
          fields,
        });
        return;
      }
      if (name.endsWith('.xml') || looksLikeTaskDataXml(text)) {
        const tree = parseIsoxmlTaskData(text);
        const farms = flattenIsoxmlFarms(tree);
        const fieldCount = farms.reduce((n, f) => n + f.fields.length, 0);
        if (!fieldCount) throw new Error('No field boundaries found in TASKDATA.XML');
        setPreview({
          kind: 'isoxml',
          summary: summarizeIsoxml(tree),
          farmCount: farms.length,
          fieldCount,
          tree,
        });
        return;
      }
      throw new Error('Choose a TASKDATA.XML (ISOXML) or .kml file. Unzip Ops Center exports first.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const runImport = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    setResultText(null);
    try {
      if (preview.kind === 'isoxml') {
        const results = await applyIsoxmlImport({
          tree: preview.tree,
          currentFarmId,
          currentFarmName,
          conflict,
          onCurrentFarmBlock,
        });
        const lines = results.map((r) => {
          const where = r.intoCurrent
            ? 'this farm'
            : `new farm “${r.farmName}” (owned by you — switch farm later to open)`;
          return `${r.farmName}: +${r.added} on ${where}${r.replaced ? `, replaced ${r.replaced}` : ''}`;
        });
        setResultText(lines.join('\n') || 'Nothing imported');
      } else {
        const r = await applyKmlImport({
          fields: preview.fields,
          currentFarmId,
          conflict,
          onCurrentFarmBlock,
        });
        setResultText(`KML: +${r.added} paddocks on this farm${r.replaced ? `, replaced ${r.replaced}` : ''}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900">Import boundaries</h3>
            <p className="text-xs text-slate-500">John Deere Ops Center ISOXML or KML (like PUF-mobile)</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-8 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/40">
            <FileUp className="w-8 h-8 text-indigo-600" />
            <span className="text-sm font-semibold text-slate-800">Choose TASKDATA.XML or .kml</span>
            <span className="text-[11px] text-slate-500 text-center">
              Unzip Ops Center “Files” exports first if you have a .zip
            </span>
            <input
              type="file"
              accept=".xml,.kml,text/xml,application/xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = '';
              }}
            />
          </label>

          {preview && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="text-sm font-semibold text-slate-800">{preview.summary}</div>
              <ul className="text-xs text-slate-600 space-y-0.5 max-h-36 overflow-y-auto">
                {detailLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {preview.kind === 'isoxml' && (
                <p className="text-[11px] text-slate-500">
                  Farms whose name matches <strong>{currentFarmName || 'this farm'}</strong> (or a
                  single-farm file) land on the map now. Other farms are created under your account.
                </p>
              )}
            </div>
          )}

          <div className="space-y-1">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              If paddock names already exist
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConflict('keepBoth')}
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

          {error && (
            <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
              {error}
            </div>
          )}
          {resultText && (
            <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 whitespace-pre-wrap">
              {resultText}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-xl text-slate-600 hover:bg-slate-200"
          >
            Close
          </button>
          <button
            type="button"
            disabled={!preview || busy}
            onClick={() => void runImport()}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
