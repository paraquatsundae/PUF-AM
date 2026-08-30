import { Bug, ShieldCheck, Weight } from 'lucide-react';
import type { BlockAnalyticsRow } from '../../lib/mapBlockAnalytics';
import type { OrchardBlock } from '../../lib/mapStore';
import { cn } from '../../lib/utils';

export function EditAnalyticsSidebar({
  blocks,
  harvests,
  analyticsView,
  setAnalyticsView,
  highlightedBlockId,
  blockAnalytics,
  onSelectBlock,
}: {
  blocks: OrchardBlock[];
  harvests: Array<{ totalWeight?: number }>;
  analyticsView: 'risk' | 'yield';
  setAnalyticsView: (view: 'risk' | 'yield') => void;
  highlightedBlockId: string | null;
  blockAnalytics: Record<string, BlockAnalyticsRow>;
  onSelectBlock: (blockId: string) => void;
}) {
  if (blocks.length === 0) {
    return (
      <div className="p-4 border-2 border-dashed border-slate-200 rounded-xl text-center space-y-2">
        <p className="text-sm text-slate-500">No analytics available.</p>
        <p className="text-xs text-slate-400">Draw blocks to generate insights.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* View Toggle */}
      <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
        <button
          onClick={() => setAnalyticsView('risk')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${analyticsView === 'risk' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Bug className="w-3.5 h-3.5" />
          Risk
        </button>
        <button
          onClick={() => setAnalyticsView('yield')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${analyticsView === 'yield' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Weight className="w-3.5 h-3.5" />
          Yield
        </button>
      </div>

      {analyticsView === 'yield' && (
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-4 text-white shadow-md">
          <div className="text-indigo-100 text-xs font-semibold uppercase tracking-wider mb-1">Total Farm Yield</div>
          <div className="flex items-end gap-2">
            <div className="text-4xl font-bold">
              {(harvests.reduce((acc, h) => acc + (h.totalWeight || 0), 0) / 1000).toFixed(1)} t
            </div>
            <div className="text-sm font-medium text-indigo-100 mb-1">Current Season</div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Block Status</h3>
        <div className="space-y-2">
          {blocks.map((block) => {
            const data = blockAnalytics[block.id];
            if (!data) return null;

            return (
              <div
                key={block.id}
                id={`analytics-block-item-${block.id}`}
                onClick={() => onSelectBlock(block.id)}
                className={cn(
                  'flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg border transition-colors cursor-pointer',
                  highlightedBlockId === block.id
                    ? 'border-indigo-500 bg-indigo-50/50'
                    : 'border-transparent hover:border-slate-100'
                )}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: analyticsView === 'risk' ? data.color : data.yieldColor }} />
                  <span className="text-sm font-medium text-slate-700">{block.name || 'Unnamed Block'}</span>
                  {data.hasProtection && analyticsView === 'risk' && (
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                  )}
                </div>
                <span className="text-xs text-slate-500 font-mono">
                  {analyticsView === 'risk' ? `${data.overall} Risk` : `${(data.yieldPerHa / 1000).toFixed(1)} t/ha`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
