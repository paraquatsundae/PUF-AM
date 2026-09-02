import React from 'react';
import { Hexagon, X } from 'lucide-react';
import { motion } from 'motion/react';
import { allPackCultivars } from '../../packs/registry';
import { cn } from '../../lib/utils';
import {
  internalBoundariesIntersectingBlock,
} from '../../lib/paddockExclusions';
import type { InfrastructurePin, OrchardBlock } from '../../lib/mapStore';
import {
  areaWordForCropKind,
  defaultGeometryKind,
  getEnterprise,
  isTreeCropKind,
  resolveFarmProfile,
  type FarmEnterpriseId,
  type FarmProfile,
} from '../../../shared/farm/farmTypes';
import { getInfraType } from '../../../shared/farm/infraTypes';
import type { InternalBoundaryKind } from './BoundaryEditActionBar';

/** Read once — the pack registry is static for the life of the bundle. */
const cultivarOptions = allPackCultivars();

export function BlockMetadataModal({
  editingBlockId,
  blocks,
  pins,
  farmProfile,
  canEdit,
  mapMode,
  isConfirmingDeleteBlock,
  setIsConfirmingDeleteBlock,
  updateBlock,
  beginInternalBoundaryDraw,
  beginBoundaryEdit,
  onClose,
  onDelete,
  onOpenPin,
}: {
  editingBlockId: string;
  blocks: OrchardBlock[];
  pins: InfrastructurePin[];
  farmProfile: FarmProfile | undefined;
  canEdit: boolean;
  mapMode: 'operate' | 'edit';
  isConfirmingDeleteBlock: boolean;
  setIsConfirmingDeleteBlock: (v: boolean) => void;
  updateBlock: (id: string, updates: Partial<OrchardBlock>) => void;
  beginInternalBoundaryDraw: (kind: InternalBoundaryKind, blockId: string) => void;
  beginBoundaryEdit: (blockId: string) => void;
  onClose: () => void;
  onDelete: () => void;
  onOpenPin: (pinId: string) => void;
}) {
  const settings = { farmProfile };
  return (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={onClose}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 max-h-[90vh] overflow-y-auto"
            >
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="font-bold text-slate-900">
                  {areaWordForCropKind(blocks.find((b) => b.id === editingBlockId)?.cropKind)} details
                </h3>
                <button 
                  onClick={onClose}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                {(() => {
                  const block = blocks.find(b => b.id === editingBlockId);
                  if (!block) return null;

                  const farmProfile = resolveFarmProfile(settings.farmProfile);
                  const kindOptions = farmProfile.enterprises.length
                    ? farmProfile.enterprises
                    : (['orchard_tree'] as FarmEnterpriseId[]);
                  const kind = (block.cropKind && kindOptions.includes(block.cropKind)
                    ? block.cropKind
                    : kindOptions[0]!) as FarmEnterpriseId;
                  const tree = isTreeCropKind(kind);
                  const ent = getEnterprise(kind);

                  return (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          {areaWordForCropKind(kind)} name
                        </label>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            value={block.name}
                            onChange={(e) => updateBlock(block.id, { name: e.target.value })}
                            className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                            placeholder="e.g. North Ridge A"
                          />
                          {block.areaHa !== undefined && (
                            <div className="flex items-center justify-center px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 whitespace-nowrap" title="Calculated Area">
                              {block.areaHa} ha
                            </div>
                          )}
                        </div>
                      </div>

                      {(() => {
                        const internals = internalBoundariesIntersectingBlock(block, pins);
                        return (
                          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                Internal boundaries
                              </label>
                              <span className="text-[10px] text-slate-400">
                                {internals.length === 0 ? 'None' : `${internals.length}`}
                              </span>
                            </div>
                            {internals.length > 0 ? (
                              <ul className="space-y-1">
                                {internals.map((pin) => {
                                  const def = getInfraType(pin.type);
                                  return (
                                    <li key={pin.id}>
                                      <button
                                        type="button"
                                        onClick={() => onOpenPin(pin.id)}
                                        className="w-full flex items-center justify-between gap-2 rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 text-left text-xs hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors"
                                      >
                                        <span className="font-medium text-slate-800 truncate">
                                          {pin.name || def?.shortLabel || 'Boundary'}
                                        </span>
                                        <span
                                          className={cn(
                                            'shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded',
                                            pin.type === 'internal_impassable'
                                              ? 'bg-orange-100 text-orange-800'
                                              : 'bg-stone-100 text-stone-700'
                                          )}
                                        >
                                          {pin.type === 'internal_impassable'
                                            ? 'Impassable'
                                            : 'Passable'}
                                        </span>
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : (
                              <p className="text-[11px] text-slate-500 leading-snug">
                                Pads stay in usable area; hazard zones subtract from ha.
                              </p>
                            )}
                            {canEdit && mapMode === 'edit' ? (
                              <div className="flex gap-2 pt-0.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    beginInternalBoundaryDraw('internal_passable', block.id)
                                  }
                                  className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-stone-200/80 text-stone-800 text-[11px] font-semibold hover:bg-stone-300 transition-colors"
                                >
                                  <Hexagon className="w-3.5 h-3.5" />
                                  Add pad
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    beginInternalBoundaryDraw('internal_impassable', block.id)
                                  }
                                  className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-orange-100 text-orange-900 text-[11px] font-semibold hover:bg-orange-200 transition-colors"
                                >
                                  <Hexagon className="w-3.5 h-3.5" />
                                  Add hazard
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}

                      {kindOptions.length > 1 && (
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                            Type
                          </label>
                          <select
                            value={kind}
                            onChange={(e) => {
                              const next = e.target.value as FarmEnterpriseId;
                              const nextTree = isTreeCropKind(next);
                              updateBlock(block.id, {
                                cropKind: next,
                                geometryKind: defaultGeometryKind(next),
                                ...(nextTree
                                  ? {}
                                  : { species: '', density: '', cultivar: block.seasonLabel || '' }),
                              });
                            }}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          >
                            {kindOptions.map((id) => (
                              <option key={id} value={id}>
                                {getEnterprise(id).label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {tree ? (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Species</label>
                              <input
                                type="text"
                                value={block.species || ''}
                                onChange={(e) => updateBlock(block.id, { species: e.target.value })}
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                placeholder="e.g. walnut"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Cultivar</label>
                              <select 
                                value={block.cultivar}
                                onChange={(e) => updateBlock(block.id, { cultivar: e.target.value })}
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white"
                              >
                                <option value="">Select cultivar...</option>
                                {cultivarOptions.map((c) => (
                                  <option key={c.id} value={c.name}>
                                    {c.note ? `${c.name} (${c.note})` : c.name}
                                  </option>
                                ))}
                                <option value="Other">Other / Mixed</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Row Spacing</label>
                              <div className="relative">
                                <input 
                                  type="number" 
                                  value={block.rowSpacing || ''}
                                  onChange={(e) => {
                                    const rowSpacing = parseFloat(e.target.value);
                                    const treeSpacing = block.treeSpacing || 0;
                                    const updates: Partial<OrchardBlock> = { rowSpacing };
                                    if (rowSpacing > 0 && treeSpacing > 0) {
                                      updates.density = Math.round(10000 / (rowSpacing * treeSpacing)).toString();
                                    }
                                    updateBlock(block.id, updates);
                                  }}
                                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all pr-8"
                                  placeholder="8"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                                  m
                                </span>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Tree Spacing</label>
                              <div className="relative">
                                <input 
                                  type="number" 
                                  value={block.treeSpacing || ''}
                                  onChange={(e) => {
                                    const treeSpacing = parseFloat(e.target.value);
                                    const rowSpacing = block.rowSpacing || 0;
                                    const updates: Partial<OrchardBlock> = { treeSpacing };
                                    if (rowSpacing > 0 && treeSpacing > 0) {
                                      updates.density = Math.round(10000 / (rowSpacing * treeSpacing)).toString();
                                    }
                                    updateBlock(block.id, updates);
                                  }}
                                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all pr-8"
                                  placeholder="6"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                                  m
                                </span>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Tree Height</label>
                              <div className="relative">
                                <input 
                                  type="number" 
                                  value={block.treeHeight || ''}
                                  onChange={(e) => updateBlock(block.id, { treeHeight: parseFloat(e.target.value) })}
                                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all pr-8"
                                  placeholder="4.5"
                                  step="0.1"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                                  m
                                </span>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Canopy Width</label>
                              <div className="relative">
                                <input 
                                  type="number" 
                                  value={block.canopyWidth || ''}
                                  onChange={(e) => updateBlock(block.id, { canopyWidth: parseFloat(e.target.value) })}
                                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all pr-8"
                                  placeholder="4.0"
                                  step="0.1"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                                  m
                                </span>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Irrigation</label>
                              <select 
                                value={block.irrigation}
                                onChange={(e) => updateBlock(block.id, { irrigation: e.target.value })}
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white"
                              >
                                <option value="">Select...</option>
                                <option value="drip">Drip</option>
                                <option value="micro-sprinkler">Micro-sprinkler</option>
                                <option value="sprinkler">Overhead Sprinkler</option>
                                <option value="none">Dryland / None</option>
                              </select>
                            </div>

                            <div className="col-span-2 p-3 bg-indigo-50 border border-indigo-100 rounded-xl space-y-1">
                              <div className="flex justify-between items-center">
                                <p className="text-[10px] font-bold text-slate-700 uppercase font-mono">Calculated TRV</p>
                                <span className="text-sm font-bold text-indigo-600 font-mono">
                                  {block.treeHeight && block.canopyWidth && block.rowSpacing 
                                    ? Math.round((block.treeHeight * block.canopyWidth * 10000) / block.rowSpacing).toLocaleString()
                                    : '0'} m³/ha
                                </span>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="space-y-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                              {ent.varietyLabel}
                            </label>
                            <input
                              type="text"
                              value={block.seasonLabel || block.cultivar || ''}
                              onChange={(e) =>
                                updateBlock(block.id, {
                                  seasonLabel: e.target.value,
                                  cultivar: e.target.value,
                                  species: '',
                                })
                              }
                              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                              placeholder={
                                ent.paddockModel === 'dam'
                                  ? 'e.g. Marron'
                                  : ent.paddockModel === 'water_zone'
                                    ? 'e.g. Bore 2 zone'
                                    : 'e.g. 2026 canola'
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Irrigation</label>
                            <select 
                              value={block.irrigation}
                              onChange={(e) => updateBlock(block.id, { irrigation: e.target.value })}
                              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white"
                            >
                              <option value="">Select...</option>
                              <option value="drip">Drip</option>
                              <option value="micro-sprinkler">Micro-sprinkler</option>
                              <option value="sprinkler">Overhead Sprinkler</option>
                              <option value="none">Dryland / None</option>
                            </select>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            Tree spacing, TRV and Kc only apply to orchard / fruit / vineyard areas.
                          </p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
                {isConfirmingDeleteBlock ? (
                  <div className="flex items-center justify-between w-full gap-3">
                    <span className="text-sm font-medium text-red-600">Delete this block?</span>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setIsConfirmingDeleteBlock(false)}
                        className="px-4 py-2 text-slate-600 hover:bg-slate-200 text-sm font-medium rounded-xl transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={onDelete}
                        className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition-colors shadow-sm"
                      >
                        Yes, Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button 
                      onClick={() => setIsConfirmingDeleteBlock(true)}
                      className="px-4 py-2 text-red-600 hover:bg-red-50 text-sm font-medium rounded-xl transition-colors"
                    >
                      Delete Block
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => beginBoundaryEdit(editingBlockId)}
                        disabled={!canEdit || mapMode !== 'edit'}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 text-sm font-medium rounded-xl transition-colors disabled:opacity-40"
                      >
                        <Hexagon className="w-4 h-4" />
                        Edit boundary
                      </button>
                      <button 
                        onClick={onClose}
                        className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
                      >
                        Save & Close
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
  );
}
