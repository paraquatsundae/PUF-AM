import type { InfrastructurePin, OrchardBlock } from '../../lib/mapStore';
import { internalBoundariesIntersectingBlock } from '../../lib/paddockExclusions';
import { cn } from '../../lib/utils';
import {
  areaWordForCropKind,
  getEnterprise,
  isTreeCropKind,
  type FarmEnterpriseId,
  type MapUiCopy,
} from '../../../shared/farm/farmTypes';
import type { InternalBoundaryKind } from './BoundaryEditActionBar';

export function EditBlocksSidebar({
  blocks,
  pins,
  highlightedBlockId,
  canEdit,
  mapCopy,
  onSelectBlock,
  beginInternalBoundaryDraw,
}: {
  blocks: OrchardBlock[];
  pins: InfrastructurePin[];
  highlightedBlockId: string | null;
  canEdit: boolean;
  mapCopy: MapUiCopy;
  onSelectBlock: (blockId: string) => void;
  beginInternalBoundaryDraw: (kind: InternalBoundaryKind, blockId: string) => void;
}) {
  if (blocks.length === 0) {
    return (
      <div className="p-4 border-2 border-dashed border-slate-200 rounded-xl text-center space-y-2">
        <p className="text-sm text-slate-500">No {mapCopy.blocksTab.toLowerCase()} defined yet.</p>
        <p className="text-xs text-slate-400">Start by drawing on the map.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex justify-between items-center mb-4">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Area</div>
        <div className="font-bold text-indigo-600">{blocks.reduce((sum, b) => sum + (b.areaHa || 0), 0).toFixed(2)} ha</div>
      </div>
      {blocks.map((block) => (
        <div
          key={block.id}
          id={`block-item-${block.id}`}
          onClick={() => onSelectBlock(block.id)}
          className={cn(
            'p-3 border rounded-xl hover:shadow-md transition-all cursor-pointer bg-white group',
            highlightedBlockId === block.id
              ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md'
              : 'border-slate-200 hover:border-indigo-400'
          )}
        >
          <div className="flex justify-between items-start mb-1 gap-2">
            <div className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors min-w-0">
              {block.name || `Unnamed ${areaWordForCropKind(block.cropKind)}`}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {block.cropKind && (
                <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                  {getEnterprise(block.cropKind as FarmEnterpriseId).shortLabel}
                </span>
              )}
              {block.areaHa !== undefined && (
                <div className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                  {block.areaHa} ha
                </div>
              )}
            </div>
          </div>
          <div className="text-xs text-slate-500 flex flex-col gap-1">
            {isTreeCropKind(block.cropKind) ? (
              <>
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="font-medium text-slate-600">Species:</span>{' '}
                  {block.species || '—'}
                  <span className="text-slate-300 mx-1">·</span>
                  <span className="font-medium text-slate-600">Cultivar:</span>{' '}
                  {block.cultivar || 'Not set'}
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-medium text-slate-600">Spacing:</span>{' '}
                  {block.rowSpacing && block.treeSpacing
                    ? `${block.rowSpacing}m x ${block.treeSpacing}m`
                    : 'Not set'}
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-medium text-slate-600">Density:</span>{' '}
                  {block.density ? `${block.density} trees/ha` : 'Not set'}
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-medium text-slate-600">TRV:</span>{' '}
                  {block.treeHeight && block.canopyWidth && block.rowSpacing
                    ? `${Math.round((block.treeHeight * block.canopyWidth * 10000) / block.rowSpacing).toLocaleString()} m³/ha`
                    : 'Not set'}
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-medium text-slate-600">Crop Coefficient (Kc):</span>{' '}
                  {block.canopyWidth && block.rowSpacing
                    ? (0.2 + 0.8 * Math.min(1, block.canopyWidth / block.rowSpacing)).toFixed(2)
                    : 'Not set'}
                </div>
                {block.density && block.areaHa !== undefined && (
                  <div className="mt-2 pt-2 border-t border-slate-100 grid grid-cols-2 gap-2">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        Est. Trees
                      </span>
                      <span className="font-medium text-indigo-600">
                        {Math.round(block.areaHa * parseInt(block.density, 10)).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        Est. Yield
                      </span>
                      <span className="font-medium text-emerald-600">
                        {Math.round((block.areaHa * parseInt(block.density, 10) * 25) / 1000).toLocaleString()} t
                      </span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div>
                  <span className="font-medium text-slate-600">
                    {block.cropKind
                      ? getEnterprise(block.cropKind as FarmEnterpriseId).varietyLabel
                      : 'Crop'}
                    :
                  </span>{' '}
                  {block.seasonLabel || block.cultivar || 'Not set yet'}
                </div>
                {block.irrigation ? (
                  <div>
                    <span className="font-medium text-slate-600">Irrigation:</span> {block.irrigation}
                  </div>
                ) : null}
              </>
            )}
            {(() => {
              const internals = internalBoundariesIntersectingBlock(block, pins);
              if (internals.length === 0 && highlightedBlockId !== block.id) return null;
              return (
                <div
                  className="mt-2 pt-2 border-t border-slate-100 space-y-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Internal boundaries
                    {internals.length > 0 ? ` · ${internals.length}` : ''}
                  </div>
                  {internals.length > 0 ? (
                    <ul className="space-y-0.5">
                      {internals.map((pin) => (
                        <li
                          key={pin.id}
                          className="text-[11px] text-slate-600 flex items-center justify-between gap-2"
                        >
                          <span className="truncate">{pin.name}</span>
                          <span className="shrink-0 text-slate-400">
                            {pin.type === 'internal_impassable' ? 'Impassable' : 'Passable'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {canEdit && highlightedBlockId === block.id ? (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          beginInternalBoundaryDraw('internal_passable', block.id)
                        }
                        className="flex-1 px-2 py-1 rounded-md bg-stone-100 text-stone-700 text-[10px] font-semibold hover:bg-stone-200"
                      >
                        Add pad
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          beginInternalBoundaryDraw('internal_impassable', block.id)
                        }
                        className="flex-1 px-2 py-1 rounded-md bg-orange-50 text-orange-800 text-[10px] font-semibold hover:bg-orange-100"
                      >
                        Add hazard
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })()}
          </div>
        </div>
      ))}
    </div>
  );
}
