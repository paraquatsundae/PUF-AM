import { Suspense, useMemo, useState } from 'react';
import { ChevronDown, Map } from 'lucide-react';
import { lazyWithRetry } from '../../lib/lazyWithRetry';
import type { OrchardBlock } from '../../lib/mapStore';
import { cn } from '../../lib/utils';

const DiaryPaddockMiniMap = lazyWithRetry(() =>
  import('../map/DiaryPaddockMiniMap').then((m) => ({ default: m.DiaryPaddockMiniMap }))
);

type Props = {
  blocks: OrchardBlock[];
  selectedBlockIds: string[];
  onToggleBlock: (blockId: string) => void;
  onClearBlocks: () => void;
  farmId?: string;
};

export function DiaryBlockPicker({
  blocks,
  selectedBlockIds,
  onToggleBlock,
  onClearBlocks,
  farmId,
}: Props) {
  const [mapOpen, setMapOpen] = useState(false);
  const blocksSorted = useMemo(
    () => [...blocks].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [blocks]
  );
  const selected = new Set(selectedBlockIds);
  const countLabel =
    selectedBlockIds.length === 0
      ? null
      : selectedBlockIds.length === 1
        ? '1 paddock'
        : `${selectedBlockIds.length} paddocks`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 ml-1">
        <p className="text-[10px] font-bold uppercase text-slate-400">Paddocks</p>
        {countLabel && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
            {countLabel}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={selectedBlockIds.length === 0}
          onClick={onClearBlocks}
          className={cn(
            'shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
            selectedBlockIds.length === 0
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
          )}
        >
          Farm-wide
        </button>
        {blocksSorted.map((block) => {
          const on = selected.has(block.id);
          return (
            <button
              key={block.id}
              type="button"
              aria-pressed={on}
              title={block.name ? `${block.name} (${block.areaHa} ha)` : 'Unnamed'}
              onClick={() => onToggleBlock(block.id)}
              className={cn(
                'max-w-[12rem] truncate shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                on
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              )}
            >
              {block.name || 'Unnamed'}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-expanded={mapOpen}
        onClick={() => setMapOpen((open) => !open)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
      >
        <Map className="w-3.5 h-3.5" aria-hidden />
        {mapOpen ? 'Hide paddock map' : 'Show paddock map'}
        <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', mapOpen && 'rotate-180')} />
      </button>
      {mapOpen && (
        <Suspense fallback={<div className="h-56 rounded-xl border border-slate-200 bg-slate-100" />}>
          <DiaryPaddockMiniMap
            blocks={blocks}
            selectedBlockIds={selectedBlockIds}
            onToggleBlock={onToggleBlock}
            farmId={farmId}
          />
        </Suspense>
      )}
    </div>
  );
}
