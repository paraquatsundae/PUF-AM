import { Fragment } from 'react';
import { Download, Search, X } from 'lucide-react';
import type { DiaryEvent } from '../../lib/farmDiary';
import { DIARY_FILTER_TABS, type DiaryFilter } from '../../lib/farmDiaryView';
import type { OrchardBlock } from '../../lib/mapStore';
import { cn } from '../../lib/utils';
import { DiaryTimelineEventCard } from './DiaryTimelineEventCard';

type Props = {
  farmId: string | undefined;
  blocks: OrchardBlock[];
  filter: DiaryFilter;
  onFilter: (filter: DiaryFilter) => void;
  searchQuery: string;
  onSearchQuery: (value: string) => void;
  filteredEvents: DiaryEvent[];
  groupedByBlock: Record<string, DiaryEvent[]>;
  sortedBlockIds: string[];
  focusBlockId: string | null;
  onFocusBlock: (blockId: string | null) => void;
  onExportCsv: () => void;
  exportBusy: 'json' | 'xlsx' | null;
  onExportJson: () => void;
  onExportXlsx: () => void;
  canEdit: boolean;
  deleteConfirmId: string | null;
  onAskDelete: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (event: DiaryEvent) => void;
  onAcceptSafety: (id: string) => void;
  onMarkDone: (event: DiaryEvent) => void;
  onCancelPlan: (event: DiaryEvent) => void;
  onUnlinkIssue: (event: DiaryEvent) => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
};

export function DiaryTimeline({
  farmId,
  blocks,
  filter,
  onFilter,
  searchQuery,
  onSearchQuery,
  filteredEvents,
  groupedByBlock,
  sortedBlockIds,
  focusBlockId,
  onFocusBlock,
  onExportCsv,
  exportBusy,
  onExportJson,
  onExportXlsx,
  canEdit,
  deleteConfirmId,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
  onAcceptSafety,
  onMarkDone,
  onCancelPlan,
  onUnlinkIssue,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 w-full sm:w-auto overflow-x-auto scrollbar-hide">
          {DIARY_FILTER_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onFilter(t.id)}
              className={cn(
                'flex-1 sm:flex-none px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all whitespace-nowrap',
                filter === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <input
              type="text"
              placeholder="Search…"
              value={searchQuery}
              onChange={(e) => onSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-400"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-100 rounded-full"
              >
                <X className="w-3 h-3 text-slate-400" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onExportCsv}
            disabled={filteredEvents.length === 0}
            className="p-2 bg-white border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 disabled:opacity-40"
            title="Export diary CSV (filtered view)"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={!farmId || !!exportBusy}
            title="Export JSON (local) — all diary rows on device"
            onClick={onExportJson}
            className="px-2 py-2 bg-white border border-slate-200 text-[10px] font-semibold uppercase tracking-wide text-slate-600 rounded-xl hover:bg-slate-50 disabled:opacity-40"
          >
            {exportBusy === 'json' ? '…' : 'JSON'}
          </button>
          <button
            type="button"
            disabled={!farmId || !!exportBusy}
            title="Export Excel (local) — all diary rows on device"
            onClick={onExportXlsx}
            className="px-2 py-2 bg-white border border-slate-200 text-[10px] font-semibold uppercase tracking-wide text-slate-600 rounded-xl hover:bg-slate-50 disabled:opacity-40"
          >
            {exportBusy === 'xlsx' ? '…' : 'Excel'}
          </button>
        </div>
      </div>

      <div className="relative">
        <div className="absolute left-6 top-0 bottom-0 w-px bg-slate-200" />

        <div className="space-y-16">
          {sortedBlockIds.length === 0 ? (
            <div className="ml-16 py-20 text-center space-y-3">
              <p className="text-sm text-slate-500">
                {searchQuery || filter !== 'all'
                  ? 'No matching entries.'
                  : focusBlockId
                    ? 'No diary entries for this block yet. Add a plan or log above.'
                    : 'No diary entries yet. Add a plan or log above.'}
              </p>
              {focusBlockId && (
                <button
                  type="button"
                  onClick={() => onFocusBlock(null)}
                  className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
                >
                  Show all farm blocks
                </button>
              )}
            </div>
          ) : (
            sortedBlockIds.map((blockId) => {
              const block = blocks.find((b) => b.id === blockId);
              const blockEvents = [...(groupedByBlock[blockId] || [])].sort((a, b) => b.date.localeCompare(a.date));

              return (
                <div key={blockId} id={`diary-block-${blockId}`} className="relative">
                  <div className="mb-6 flex items-center gap-3 bg-white px-4 py-3 rounded-xl border border-slate-200">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 tracking-tight">
                        {block ? block.name : 'General / Unassigned'}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {block ? `${block.areaHa} ha · ${block.cultivar}` : 'Farm-wide'}
                        {' · '}
                        {blockEvents.length} {blockEvents.length === 1 ? 'entry' : 'entries'}
                      </p>
                    </div>
                  </div>

                  <div className="relative ml-6 pl-10 border-l border-slate-200 space-y-8">
                    {blockEvents.map((event) => (
                      <Fragment key={event.id}>
                        <DiaryTimelineEventCard
                          event={event}
                          canEdit={canEdit}
                          deleteConfirmId={deleteConfirmId}
                          onAskDelete={onAskDelete}
                          onCancelDelete={onCancelDelete}
                          onConfirmDelete={onConfirmDelete}
                          onAcceptSafety={onAcceptSafety}
                          onMarkDone={onMarkDone}
                          onCancelPlan={onCancelPlan}
                          onUnlinkIssue={onUnlinkIssue}
                        />
                      </Fragment>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {hasMore && (
          <div className="ml-16 mt-8 flex justify-center">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className="px-6 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              {isLoadingMore ? 'Loading...' : 'Load older events'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
