import React from 'react';
import { X } from 'lucide-react';
import { motion } from 'motion/react';
import type { InfrastructurePin } from '../../lib/mapStore';
import {
  getInfraType,
  INFRA_TYPES,
  infraDrawMode,
  infraSubtractsFromPaddock,
  type InfraTypeId,
} from '../../../shared/farm/infraTypes';

export function PinMetadataModal({
  editingPinId,
  pins,
  isConfirmingDeletePin,
  setIsConfirmingDeletePin,
  updatePin,
  onClose,
  onDelete,
}: {
  editingPinId: string;
  pins: InfrastructurePin[];
  isConfirmingDeletePin: boolean;
  setIsConfirmingDeletePin: (v: boolean) => void;
  updatePin: (id: string, updates: Partial<InfrastructurePin>) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
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
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 max-h-[90vh] overflow-y-auto"
            >
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="font-bold text-slate-900">Infrastructure Metadata</h3>
                <button 
                  onClick={onClose}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                {(() => {
                  const pin = pins.find(p => p.id === editingPinId);
                  if (!pin) return null;

                  return (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Name</label>
                        <input 
                          type="text" 
                          value={pin.name}
                          onChange={(e) => updatePin(pin.id, { name: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                          placeholder="e.g. North dam, Standpipe 2"
                        />
                      </div>
                      
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Type</label>
                        <select 
                          value={pin.type}
                          onChange={(e) => {
                            const next = e.target.value as InfraTypeId;
                            const prevMode = infraDrawMode(pin.type);
                            const nextMode = infraDrawMode(next);
                            const updates: Partial<InfrastructurePin> = { type: next };
                            // Drop polygon/line geometry when switching to a point type.
                            if (
                              (prevMode === 'polygon' || prevMode === 'line') &&
                              nextMode === 'point'
                            ) {
                              updates.geojson = undefined;
                            }
                            if (next !== 'vehicle') {
                              updates.trackerId = undefined;
                            }
                            updatePin(pin.id, updates);
                          }}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white"
                        >
                          <option value="">Select type...</option>
                          {INFRA_TYPES.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.label}
                              {infraSubtractsFromPaddock(t.id)
                                ? ' — cuts paddock area'
                                : t.id === 'internal_passable'
                                  ? ' — keeps paddock area'
                                  : ''}
                            </option>
                          ))}
                        </select>
                        {getInfraType(pin.type)?.blurb ? (
                          <p className="text-[11px] text-slate-500 leading-snug">
                            {getInfraType(pin.type)?.blurb}
                          </p>
                        ) : null}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</label>
                        <select 
                          value={pin.status}
                          onChange={(e) => updatePin(pin.id, { status: e.target.value as any })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white"
                        >
                          <option value="active">Active (Online)</option>
                          <option value="warning">Warning (Needs Attention)</option>
                          <option value="offline">Offline (Maintenance)</option>
                        </select>
                      </div>

                      {pin.type === 'vehicle' && (
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                            Tracker ID
                          </label>
                          <input
                            type="text"
                            value={pin.trackerId || ''}
                            onChange={(e) =>
                              updatePin(pin.id, { trackerId: e.target.value || undefined })
                            }
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                            placeholder="Optional"
                          />
                          <p className="text-[11px] text-slate-400">
                            Meshy / GPS tracker id (optional). Live position is future work — pin is
                            home/park for now.
                          </p>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Notes</label>
                        <textarea
                          value={pin.notes || ''}
                          onChange={(e) =>
                            updatePin(pin.id, { notes: e.target.value || undefined })
                          }
                          rows={3}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-y min-h-[4.5rem]"
                          placeholder="Optional notes"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Coordinates</label>
                        <div className="w-full px-3 py-2 border border-slate-100 bg-slate-50 rounded-xl text-xs font-mono text-slate-500">
                          {pin.lat.toFixed(6)}, {pin.lng.toFixed(6)}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
                {isConfirmingDeletePin ? (
                  <div className="flex items-center justify-between w-full gap-3">
                    <span className="text-sm font-medium text-red-600">Delete this pin?</span>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setIsConfirmingDeletePin(false)}
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
                      onClick={() => setIsConfirmingDeletePin(true)}
                      className="px-4 py-2 text-red-600 hover:bg-red-50 text-sm font-medium rounded-xl transition-colors"
                    >
                      Delete Pin
                    </button>
                    <button 
                      onClick={onClose}
                      className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
                    >
                      Save & Close
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
  );
}
