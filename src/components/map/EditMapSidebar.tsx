import { FileUp, Plus, Radio, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { BlockAnalyticsRow } from '../../lib/mapBlockAnalytics';
import type { FarmTrack, InfrastructurePin, OrchardBlock } from '../../lib/mapStore';
import { cn } from '../../lib/utils';
import type { MapUiCopy } from '../../../shared/farm/farmTypes';
import { getInfraType, type InfraTypeId } from '../../../shared/farm/infraTypes';
import type { InternalBoundaryKind } from './BoundaryEditActionBar';
import { EditAnalyticsSidebar } from './EditAnalyticsSidebar';
import { EditBlocksSidebar } from './EditBlocksSidebar';
import { EditInfraSidebar } from './EditInfraSidebar';
import { EditTracksSidebar } from './EditTracksSidebar';
import type { EditMapTab, MapMode, MapSubTab } from './editMapTypes';

export function EditMapSidebar({
  mapMode,
  showSidebar,
  onCloseSidebar,
  tabs,
  activeTab,
  setActiveTab,
  showCoverage,
  setShowCoverage,
  canEdit,
  onImportBoundaries,
  onQuickAdd,
  boundaryEditBlockId,
  infraDrawKind,
  setInfraDrawKind,
  mapCopy,
  blocks,
  pins,
  tracks,
  highlightedBlockId,
  highlightedTrackId,
  onSelectBlock,
  onSelectAnalyticsBlock,
  onSelectPin,
  onSelectTrack,
  beginInternalBoundaryDraw,
  harvests,
  analyticsView,
  setAnalyticsView,
  blockAnalytics,
}: {
  mapMode: MapMode;
  showSidebar: boolean;
  onCloseSidebar: () => void;
  tabs: EditMapTab[];
  activeTab: MapSubTab;
  setActiveTab: (tab: MapSubTab) => void;
  showCoverage: boolean;
  setShowCoverage: (next: boolean | ((prev: boolean) => boolean)) => void;
  canEdit: boolean;
  onImportBoundaries: () => void;
  onQuickAdd: () => void;
  boundaryEditBlockId: string | null;
  infraDrawKind: Exclude<InfraTypeId, ''>;
  setInfraDrawKind: (id: Exclude<InfraTypeId, ''>) => void;
  mapCopy: MapUiCopy;
  blocks: OrchardBlock[];
  pins: InfrastructurePin[];
  tracks: FarmTrack[];
  highlightedBlockId: string | null;
  highlightedTrackId: string | null;
  onSelectBlock: (blockId: string) => void;
  onSelectAnalyticsBlock: (blockId: string) => void;
  onSelectPin: (pinId: string) => void;
  onSelectTrack: (track: FarmTrack) => void;
  beginInternalBoundaryDraw: (kind: InternalBoundaryKind, blockId: string) => void;
  harvests: Array<{ totalWeight?: number }>;
  analyticsView: 'risk' | 'yield';
  setAnalyticsView: (view: 'risk' | 'yield') => void;
  blockAnalytics: Record<string, BlockAnalyticsRow>;
}) {
  return (
    <>
      <AnimatePresence>
        {mapMode === 'edit' && showSidebar && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCloseSidebar}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[1000] lg:hidden"
          />
        )}
      </AnimatePresence>

      {mapMode === 'edit' && (
        <div className={`
          fixed lg:static inset-y-0 left-0 z-[1001] lg:z-auto lg:inset-auto
          w-72 sm:w-80 lg:h-full lg:min-h-0 lg:max-h-full shrink-0
          bg-white border-r border-slate-200 flex flex-col shadow-xl lg:shadow-none overflow-hidden
          transition-transform duration-300 ease-in-out
          ${showSidebar ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          <div className="shrink-0 border-b border-slate-100 bg-slate-50/50">
            <div className="p-3 sm:p-4 pb-2 flex items-center justify-between gap-2">
              <h2 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                {tabs.find((t) => t.id === activeTab)?.name} Management
              </h2>
              <div className="flex gap-2 shrink-0">
                {activeTab === 'infrastructure' && (
                  <button
                    onClick={() => setShowCoverage(!showCoverage)}
                    className={`p-1.5 rounded-lg transition-colors ${showCoverage ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                    title="Toggle Coverage Zones"
                  >
                    <Radio className="w-4 h-4" />
                  </button>
                )}
                {activeTab === 'blocks' && canEdit && mapMode === 'edit' && (
                  <button
                    type="button"
                    onClick={onImportBoundaries}
                    className="p-1.5 rounded-lg transition-colors bg-slate-200 text-slate-700 hover:bg-slate-300"
                    title="Import boundaries (ISOXML / KML)"
                  >
                    <FileUp className="w-4 h-4" />
                  </button>
                )}
                {activeTab !== 'analytics' && (
                  <button
                    onClick={onQuickAdd}
                    className={`p-1.5 rounded-lg transition-colors ${canEdit ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                    title={
                      activeTab === 'infrastructure'
                        ? (() => {
                            const def = getInfraType(infraDrawKind);
                            const mode = def?.draw || 'point';
                            const verb =
                              mode === 'polygon' ? 'Draw' : mode === 'line' ? 'Draw' : 'Add';
                            return `${verb} ${def?.shortLabel || 'asset'}`;
                          })()
                        : activeTab === 'tracks'
                          ? 'Draw Track'
                          : `Draw ${mapCopy.blockWord.charAt(0).toUpperCase()}${mapCopy.blockWord.slice(1)}`
                    }
                    disabled={!canEdit || Boolean(boundaryEditBlockId)}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={onCloseSidebar}
                  className="lg:hidden p-1.5 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <nav className="flex gap-1 px-3 sm:px-4 pb-3 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={`sidebar-${tab.id}`}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors',
                    activeTab === tab.id
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                  )}
                  title={tab.description}
                >
                  <tab.icon className="w-3 h-3" />
                  {tab.name}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4">
            {activeTab === 'blocks' && (
              <EditBlocksSidebar
                blocks={blocks}
                pins={pins}
                highlightedBlockId={highlightedBlockId}
                canEdit={canEdit}
                mapCopy={mapCopy}
                onSelectBlock={onSelectBlock}
                beginInternalBoundaryDraw={beginInternalBoundaryDraw}
              />
            )}
            {activeTab === 'infrastructure' && (
              <EditInfraSidebar
                pins={pins}
                infraDrawKind={infraDrawKind}
                setInfraDrawKind={setInfraDrawKind}
                onSelectPin={onSelectPin}
              />
            )}
            {activeTab === 'tracks' && (
              <EditTracksSidebar
                tracks={tracks}
                highlightedTrackId={highlightedTrackId}
                onSelectTrack={onSelectTrack}
              />
            )}
            {activeTab === 'analytics' && (
              <EditAnalyticsSidebar
                blocks={blocks}
                harvests={harvests}
                analyticsView={analyticsView}
                setAnalyticsView={setAnalyticsView}
                highlightedBlockId={highlightedBlockId}
                blockAnalytics={blockAnalytics}
                onSelectBlock={onSelectAnalyticsBlock}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
