import React from 'react';
import { X } from 'lucide-react';
import { motion } from 'motion/react';
import type { FarmTrack } from '../../lib/mapStore';

type DebouncedTrackName = ((id: string, name: string) => void) & {
  flush: () => void;
  cancel: () => void;
};

export function TrackMetadataModal({
  editingTrackId,
  tracks,
  isConfirmingDeleteTrack,
  setIsConfirmingDeleteTrack,
  updateTrack,
  debouncedUpdateTrackName,
  onClose,
  onDelete,
}: {
  editingTrackId: string;
  tracks: FarmTrack[];
  isConfirmingDeleteTrack: boolean;
  setIsConfirmingDeleteTrack: (v: boolean) => void;
  updateTrack: (id: string, updates: Partial<FarmTrack>) => void;
  debouncedUpdateTrackName: DebouncedTrackName;
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
                <h3 className="font-bold text-slate-900">Track Details</h3>
                <button 
                  onClick={onClose}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                {(() => {
                  const track = tracks.find(t => t.id === editingTrackId);
                  if (!track) return null;

                  return (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Track Name</label>
                        <input 
                          type="text" 
                          defaultValue={track.name}
                          key={`track-name-${track.id}`}
                          onChange={(e) => debouncedUpdateTrackName(track.id, e.target.value)}
                          onBlur={(e) => {
                            debouncedUpdateTrackName.flush();
                            if (e.target.value !== track.name) {
                              updateTrack(track.id, { name: e.target.value });
                            }
                          }}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                          placeholder="e.g. Main Access Road"
                        />
                      </div>
                      
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Category</label>
                        <select 
                          value={track.category}
                          onChange={(e) => updateTrack(track.id, { category: e.target.value as any })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white"
                        >
                          <option value="primary">Primary (Main Road)</option>
                          <option value="secondary">Secondary (Inter-block)</option>
                          <option value="service">Service (Utility/Irrigation)</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Created At</label>
                        <div className="w-full px-3 py-2 border border-slate-100 bg-slate-50 rounded-xl text-xs font-mono text-slate-500">
                          {new Date(track.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
                {isConfirmingDeleteTrack ? (
                  <div className="flex items-center justify-between w-full gap-3">
                    <span className="text-sm font-medium text-red-600">Delete this track?</span>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setIsConfirmingDeleteTrack(false)}
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
                      onClick={() => setIsConfirmingDeleteTrack(true)}
                      className="px-4 py-2 text-red-600 hover:bg-red-50 text-sm font-medium rounded-xl transition-colors"
                    >
                      Delete Track
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
