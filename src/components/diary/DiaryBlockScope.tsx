import { LayoutGrid, X } from 'lucide-react';
import type { OrchardBlock } from '../../lib/mapStore';
import { cn } from '../../lib/utils';

type Props = {
  blocksSorted: OrchardBlock[];
  focusBlockId: string | null;
  focusBlock: OrchardBlock | undefined;
  onFocusBlock: (blockId: string | null) => void;
};

export function DiaryBlockScope({
  blocksSorted,
  focusBlockId,
  focusBlock,
  onFocusBlock,
}: Props) {
  if (blocksSorted.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Blocks
        </p>
        {focusBlockId && (
          <button
            type="button"
            onClick={() => onFocusBlock(null)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Show all blocks
          </button>
        )}
      </div>
      {focusBlockId && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-bold text-emerald-950 truncate">
              {focusBlock?.name || 'Selected block'}
            </p>
            <p className="text-[11px] text-emerald-800/80">
              Viewing this block only
              {focusBlock?.cultivar ? ` · ${focusBlock.cultivar}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onFocusBlock(null)}
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-emerald-200 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
          >
            <X className="w-3.5 h-3.5" />
            All farm
          </button>
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
        <button
          type="button"
          onClick={() => onFocusBlock(null)}
          className={cn(
            'shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
            !focusBlockId
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
          )}
        >
          All farm
        </button>
        {blocksSorted.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onFocusBlock(b.id)}
            className={cn(
              'shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors max-w-[10rem] truncate',
              focusBlockId === b.id
                ? 'bg-emerald-700 text-white border-emerald-700'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            )}
            title={b.name}
          >
            {b.name || 'Unnamed'}
          </button>
        ))}
      </div>
    </div>
  );
}
