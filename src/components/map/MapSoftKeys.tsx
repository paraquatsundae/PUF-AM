import { Hexagon } from 'lucide-react';
import { House as PhHouse, Crosshair as PhCrosshair, Flag as PhFlag } from '@phosphor-icons/react';
import { cn } from '../../lib/utils';
import { AddIssueIcon } from './AddIssueIcon';
import type { UserGeoFix } from './UserLocationLayer';

export function MapSoftKeys({
  mapTitle,
  onGoHome,
  onLocateMe,
  userFix,
  followUser,
  mapMode,
  showIssueFlags,
  onToggleFlags,
  placingHighlight,
  highlightDraftGeo,
  onToggleHighlight,
  placingFlag,
  onTogglePlaceFlag,
}: {
  mapTitle: string;
  onGoHome: () => void;
  onLocateMe: () => void;
  userFix: UserGeoFix | null;
  followUser: boolean;
  mapMode: 'operate' | 'edit';
  showIssueFlags: boolean;
  onToggleFlags: () => void;
  placingHighlight: boolean;
  highlightDraftGeo: unknown;
  onToggleHighlight: () => void;
  placingFlag: boolean;
  onTogglePlaceFlag: () => void;
}) {
  return (
    <div className="pufom-map-softkeys absolute top-3 right-3 flex flex-col gap-1.5 z-[1000] pointer-events-none">
      <button
        type="button"
        onClick={onGoHome}
        title={`${mapTitle.replace(/ Map$/, '')} home`}
        aria-label={`${mapTitle.replace(/ Map$/, '')} home`}
        className="w-9 h-9 inline-flex items-center justify-center bg-white/90 backdrop-blur shadow-md rounded-lg border border-white/20 text-slate-700 hover:text-indigo-600 pointer-events-auto transition-colors active:scale-95"
      >
        <PhHouse size={20} weight="regular" className="pufom-map-icon" color="currentColor" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onLocateMe}
        title={
          userFix
            ? followUser
              ? 'Following you — pan to stop'
              : 'Center on my location'
            : 'Find my location'
        }
        aria-label="Locate me"
        aria-pressed={followUser}
        className={cn(
          'w-9 h-9 inline-flex items-center justify-center bg-white/90 backdrop-blur shadow-md rounded-lg border pointer-events-auto transition-colors active:scale-95',
          followUser || userFix
            ? 'border-sky-500 text-sky-700 bg-sky-50 ring-1 ring-sky-500/30'
            : 'border-white/20 text-slate-700 hover:text-indigo-600'
        )}
      >
        <PhCrosshair
          size={20}
          weight={followUser ? 'fill' : 'regular'}
          className="pufom-map-icon"
          color="currentColor"
          aria-hidden
        />
      </button>
      {mapMode === 'operate' && (
        <>
          <button
            type="button"
            onClick={onToggleFlags}
            title={showIssueFlags ? 'Hide issue flags' : 'Show issue flags'}
            aria-label={showIssueFlags ? 'Hide issue flags' : 'Show issue flags'}
            aria-pressed={showIssueFlags}
            className={cn(
              'w-9 h-9 inline-flex items-center justify-center bg-white/90 backdrop-blur shadow-md rounded-lg border pointer-events-auto transition-colors active:scale-95',
              showIssueFlags
                ? 'border-amber-500 text-amber-800 bg-amber-50 ring-1 ring-amber-500/40'
                : 'border-white/20 text-slate-700 hover:text-amber-700'
            )}
          >
            <PhFlag
              size={20}
              weight={showIssueFlags ? 'fill' : 'regular'}
              className="pufom-map-icon"
              color="currentColor"
              aria-hidden
            />
          </button>
          <button
            type="button"
            onClick={onToggleHighlight}
            title={
              placingHighlight || highlightDraftGeo
                ? 'Cancel check-this highlight'
                : 'Check this — paint an area for the crew'
            }
            aria-label={placingHighlight || highlightDraftGeo ? 'Cancel check-this highlight' : 'Check this area'}
            aria-pressed={placingHighlight || Boolean(highlightDraftGeo)}
            className={cn(
              'w-9 h-9 inline-flex items-center justify-center bg-white/90 backdrop-blur shadow-md rounded-lg border pointer-events-auto transition-colors active:scale-95',
              placingHighlight || highlightDraftGeo
                ? 'border-teal-600 text-teal-800 bg-teal-50 ring-1 ring-teal-500/40'
                : 'border-white/20 text-slate-700 hover:text-teal-700'
            )}
          >
            <Hexagon size={20} className="pufom-map-icon shrink-0" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onTogglePlaceFlag}
            title={placingFlag ? 'Cancel adding issue' : 'Add issue — tap map to drop pin'}
            aria-label={placingFlag ? 'Cancel adding issue' : 'Add issue'}
            aria-pressed={placingFlag}
            className={cn(
              'w-9 h-9 inline-flex items-center justify-center bg-white/90 backdrop-blur shadow-md rounded-lg border pointer-events-auto transition-colors active:scale-95',
              placingFlag
                ? 'border-amber-500 text-amber-800 bg-amber-50 ring-1 ring-amber-500/40'
                : 'border-white/20 text-slate-700 hover:text-amber-700'
            )}
          >
            <AddIssueIcon size={22} className="pufom-map-icon" />
          </button>
        </>
      )}
    </div>
  );
}
