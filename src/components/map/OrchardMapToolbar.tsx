import type { FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CircleHelp,
  HardDrive,
  Loader2,
  Menu,
  RefreshCw,
  Search,
  Settings2,
  User,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatPackBytes, type BasemapPack } from '../../lib/basemapPack';
import type { MapUiCopy } from '../../../shared/farm/farmTypes';
import type { EditMapTab, MapMode, MapSubTab } from './editMapTypes';

export function OrchardMapToolbar({
  mapMode,
  mapCopy,
  showSidebar,
  onToggleSidebar,
  showCrewChip,
  crewNearby,
  crewPublishStatus,
  crewSharing,
  crewError,
  pendingSyncCount,
  onFlushSync,
  searchQuery,
  onSearchQuery,
  onSearch,
  isSearching,
  basemapPack,
  basemapBusy,
  basemapSkipped,
  onOpenBasemapSetup,
  onClearBasemap,
  onOpenHelp,
  canEdit,
  onEnterEdit,
  onExitEdit,
  tabs,
  activeTab,
  onSelectTab,
  syncError,
  onClearSyncError,
}: {
  mapMode: MapMode;
  mapCopy: MapUiCopy;
  showSidebar: boolean;
  onToggleSidebar: () => void;
  showCrewChip: boolean;
  crewNearby: number;
  crewPublishStatus: 'off' | 'no-gps' | 'error' | 'live' | 'idle';
  crewSharing: boolean;
  crewError: string | null | undefined;
  pendingSyncCount: number;
  onFlushSync: () => void;
  searchQuery: string;
  onSearchQuery: (value: string) => void;
  onSearch: (e: FormEvent) => void;
  isSearching: boolean;
  basemapPack: BasemapPack | null;
  basemapBusy: boolean;
  basemapSkipped: boolean;
  onOpenBasemapSetup: () => void;
  onClearBasemap: () => void;
  onOpenHelp: () => void;
  canEdit: boolean;
  onEnterEdit: () => void;
  onExitEdit: () => void;
  tabs: EditMapTab[];
  activeTab: MapSubTab;
  onSelectTab: (tab: MapSubTab) => void;
  syncError: string | null;
  onClearSyncError: () => void;
}) {
  return (
    <>
      <div className="shrink-0 z-20 bg-white border-b border-slate-200 px-2 sm:px-3 py-1.5">
        <div className="flex items-center gap-2 min-h-[36px]">
          {mapMode === 'edit' && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="lg:hidden p-1.5 text-slate-600 rounded-lg hover:bg-slate-100"
              title="Edit tools"
              aria-label={showSidebar ? 'Close edit tools' : 'Open edit tools'}
            >
              {showSidebar ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          )}

          <h1 className="text-sm sm:text-base font-bold text-slate-900 whitespace-nowrap shrink-0">
            {mapMode === 'operate' ? mapCopy.mapTitle : mapCopy.editTitle}
          </h1>
          {showCrewChip && (
            <span
              className={cn(
                'inline-flex items-center gap-1 h-7 px-2 rounded-md text-[10px] font-semibold border',
                crewNearby > 0
                  ? 'bg-sky-50 text-sky-800 border-sky-100'
                  : crewPublishStatus === 'error'
                    ? 'bg-rose-50 text-rose-800 border-rose-100'
                    : crewPublishStatus === 'live'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                      : 'bg-slate-50 text-slate-600 border-slate-200'
              )}
              title={
                crewError ||
                (crewNearby > 0
                  ? 'Other farm members sharing live location'
                  : crewPublishStatus === 'no-gps'
                    ? 'You can still see others without GPS. Your marker only appears once this device has a fix (tablet/phone).'
                    : crewPublishStatus === 'off'
                      ? 'Turn on Settings → Privacy → Share location with farm crew (needed on the device that should be visible)'
                      : crewPublishStatus === 'live'
                        ? 'You are sharing live location with the farm'
                        : 'Crew presence — others appear here when they share + have GPS')
              }
            >
              <User className="w-3 h-3" />
              {crewNearby > 0
                ? `Crew · ${crewNearby} nearby`
                : crewPublishStatus === 'off'
                  ? 'Crew off'
                  : crewPublishStatus === 'no-gps'
                    ? 'Crew · watching'
                    : crewPublishStatus === 'error'
                      ? 'Crew · error'
                      : crewSharing
                        ? 'Crew · sharing'
                        : 'Crew'}
            </span>
          )}
          {pendingSyncCount > 0 && (
            <button
              type="button"
              onClick={onFlushSync}
              className="hidden sm:inline-flex items-center gap-1 h-7 px-2 rounded-md bg-amber-50 text-amber-800 text-[10px] font-semibold hover:bg-amber-100"
              title="Retry uploading queued map changes to the farm cloud"
            >
              <RefreshCw className="w-3 h-3" />
              {pendingSyncCount} pending sync
            </button>
          )}

          <form
            onSubmit={onSearch}
            className="flex-1 min-w-0 max-w-xs sm:max-w-sm flex items-center h-8 rounded-lg border border-slate-200 bg-slate-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500/40 overflow-hidden"
          >
            <Search className="w-3.5 h-3.5 text-slate-400 ml-2 shrink-0" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchQuery(e.target.value)}
              placeholder="Search location…"
              className="flex-1 min-w-0 px-2 py-1 bg-transparent text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 border-none outline-none"
            />
            {isSearching && <Loader2 className="w-3.5 h-3.5 text-slate-400 mr-2 animate-spin shrink-0" />}
          </form>

          <div className="flex items-center gap-1 ml-auto shrink-0">
            {basemapPack ? (
              <>
                <span
                  className="hidden md:inline-flex items-center gap-1 h-8 px-2 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] font-medium max-w-[140px]"
                  title={`${basemapPack.label} · ${basemapPack.tileCount.toLocaleString()} tiles`}
                >
                  <HardDrive className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    Offline {formatPackBytes(basemapPack.bytes)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={onOpenBasemapSetup}
                  disabled={basemapBusy}
                  className="inline-flex items-center gap-1 h-8 px-2 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-semibold hover:bg-emerald-100 disabled:opacity-50"
                  title="Re-download farm satellite map"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', basemapBusy && 'animate-spin')} />
                  <span className="hidden sm:inline">Update</span>
                </button>
                <button
                  type="button"
                  onClick={onClearBasemap}
                  disabled={basemapBusy}
                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg disabled:opacity-50"
                  title="Clear local offline map"
                  aria-label="Clear local offline map"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onOpenBasemapSetup}
                className="inline-flex items-center gap-1 h-8 px-2 rounded-lg bg-amber-50 text-amber-800 text-[11px] font-semibold hover:bg-amber-100"
                title="Download satellite imagery for offline use"
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {basemapSkipped ? 'Save offline map' : 'Save offline map'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenHelp}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
              title="Help"
              aria-label="Help"
            >
              <CircleHelp className="w-4 h-4" />
            </button>

            {mapMode === 'edit' ? (
              <button
                type="button"
                onClick={onExitEdit}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Map</span>
              </button>
            ) : (
              canEdit && (
                <button
                  type="button"
                  onClick={onEnterEdit}
                  className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
                  title={mapCopy.editTitle}
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Edit</span>
                </button>
              )
            )}
          </div>
        </div>

        {mapMode === 'edit' && (
          <nav className="flex gap-1 mt-1.5 overflow-x-auto pb-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors',
                  activeTab === tab.id
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                )}
              >
                <tab.icon className="w-3 h-3" />
                {tab.name}
              </button>
            ))}
          </nav>
        )}
      </div>

      {syncError && (
        <div className="shrink-0 z-20 flex items-start gap-2 px-3 py-2 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="flex-1 min-w-0 leading-snug">{syncError}</p>
          {pendingSyncCount > 0 && (
            <button
              type="button"
              onClick={onFlushSync}
              className="shrink-0 font-semibold underline underline-offset-2"
            >
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={onClearSyncError}
            className="shrink-0 p-0.5 rounded hover:bg-amber-100"
            aria-label="Dismiss sync warning"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
