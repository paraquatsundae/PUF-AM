import type { FarmTrack } from '../../lib/mapStore';
import { trackCategoryChipClass } from '../../lib/trackMapStyles';
import { cn } from '../../lib/utils';

export function EditTracksSidebar({
  tracks,
  highlightedTrackId,
  onSelectTrack,
}: {
  tracks: FarmTrack[];
  highlightedTrackId: string | null;
  onSelectTrack: (track: FarmTrack) => void;
}) {
  if (tracks.length === 0) {
    return (
      <div className="p-4 border-2 border-dashed border-slate-200 rounded-xl text-center space-y-2">
        <p className="text-sm text-slate-500">No tracks defined yet.</p>
        <p className="text-xs text-slate-400">
          Use the <strong>+</strong> button or the polyline tool on the map to draw pathways.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tracks.map((track) => (
        <div
          key={track.id}
          onClick={() => onSelectTrack(track)}
          className={cn(
            'p-3 border rounded-xl hover:shadow-md transition-all cursor-pointer bg-white group',
            highlightedTrackId === track.id
              ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md'
              : 'border-slate-200 hover:border-indigo-400'
          )}
        >
          <div className="flex justify-between items-start mb-1">
            <div className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
              {track.name || 'Unnamed Track'}
            </div>
            <div
              className={cn(
                'text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase border',
                trackCategoryChipClass(track.category)
              )}
            >
              {track.category}
            </div>
          </div>
          <div className="flex justify-between items-center mt-2">
            <div className="text-xs text-slate-500">
              Added {new Date(track.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
