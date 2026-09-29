import { useState } from 'react';
import { cultivarColor, varietyAreaRows } from '../../lib/cultivarParts';
import type { OrchardBlock } from '../../lib/mapStore';
import { allPackCultivars } from '../../packs/registry';

const suggestions = allPackCultivars();

/**
 * Name a variety and draw it inside the selected paddock.
 * Areas stay visible after the draw; remove is edit-only.
 */
export function VarietySplitEditor({
  block,
  canEdit,
  highlighted,
  beginCultivarSplitDraw,
  onRemoveCultivarPart,
}: {
  block: OrchardBlock;
  canEdit: boolean;
  highlighted: boolean;
  beginCultivarSplitDraw: (blockId: string, cultivar: string) => void;
  onRemoveCultivarPart: (blockId: string, partId: string) => void;
}) {
  const [name, setName] = useState('');
  const rows = varietyAreaRows(block);
  const parts = block.cultivarParts || [];
  if (rows.length === 0 && !(canEdit && highlighted)) return null;

  return (
    <div
      className="mt-2 pt-2 border-t border-slate-100 space-y-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
        Varieties{rows.length > 0 ? ` · ${rows.length}` : ''}
      </div>
      {rows.length > 0 ? (
        <ul className="space-y-0.5">
          {parts.map((part) => (
            <li key={part.id} className="text-[11px] text-slate-700 flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0 border border-black/10"
                style={{ backgroundColor: cultivarColor(part.cultivar) }}
              />
              <span className="truncate min-w-0 flex-1">{part.cultivar}</span>
              <span className="shrink-0 tabular-nums text-slate-500">{part.areaHa.toFixed(2)} ha</span>
              {canEdit && highlighted ? (
                <button
                  type="button"
                  onClick={() => onRemoveCultivarPart(block.id, part.id)}
                  className="shrink-0 text-[10px] font-semibold text-rose-700 hover:text-rose-900"
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
          {rows
            .filter((row) => row.rest)
            .map((row) => (
              <li key="rest" className="text-[11px] text-slate-700 flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0 border border-black/10"
                  style={{ backgroundColor: row.color }}
                />
                <span className="truncate min-w-0 flex-1">{row.cultivar} · rest</span>
                <span className="shrink-0 tabular-nums text-slate-500">{row.areaHa.toFixed(2)} ha</span>
              </li>
            ))}
        </ul>
      ) : null}
      {canEdit && highlighted ? (
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const next = name.trim();
            if (!next) return;
            beginCultivarSplitDraw(block.id, next);
          }}
        >
          <input
            list={`variety-names-${block.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Variety, e.g. Tulare"
            className="flex-1 min-w-0 px-2 py-1 rounded-md border border-slate-200 text-[11px] bg-white"
          />
          <datalist id={`variety-names-${block.id}`}>
            {suggestions.map((option) => (
              <option key={option.id} value={option.name} />
            ))}
          </datalist>
          <button
            type="submit"
            disabled={!name.trim()}
            className="shrink-0 px-2 py-1 rounded-md text-[10px] font-semibold text-white disabled:opacity-40"
            style={{ backgroundColor: cultivarColor(name.trim() || 'variety') }}
          >
            Draw
          </button>
        </form>
      ) : null}
    </div>
  );
}
