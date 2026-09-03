import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import type { FarmDryer } from '../../../src/lib/farmAssets';

export type NewSessionForm = {
  dryerId: string;
  blockId: string;
  targetMoisture: number;
  initialMoisture: string;
  startTime: string;
};

export function StartDryingSessionModal({
  open,
  dryers,
  blocks,
  newSessionData,
  setNewSessionData,
  onClose,
  onSubmit,
}: {
  open: boolean;
  dryers: FarmDryer[];
  blocks: { id: string; name: string; cultivar: string }[];
  newSessionData: NewSessionForm;
  setNewSessionData: React.Dispatch<React.SetStateAction<NewSessionForm>>;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const showAddSession = open;
  const setShowAddSession = (v: boolean) => {
    if (!v) onClose();
  };
  const handleStartSession = onSubmit;

  return (
      <AnimatePresence>
        {showAddSession && (
          <div className="fixed inset-0 z-[6000] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddSession(false)}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
               <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                  <h2 className="text-lg font-bold text-slate-900">Start Drying Target</h2>
                  <button onClick={() => setShowAddSession(false)} className="p-1.5 hover:bg-slate-200 rounded-full transition-colors">
                    <X className="w-5 h-5 text-slate-500" />
                  </button>
               </div>
               <form onSubmit={handleStartSession} className="p-5 space-y-4">
                 <div className="space-y-1">
                   <label className="text-xs font-bold text-slate-500 uppercase">Dryer</label>
                   <select
                     required
                     value={newSessionData.dryerId}
                     onChange={e => setNewSessionData({...newSessionData, dryerId: e.target.value})}
                     className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                   >
                      {dryers.length === 0 && <option value="">No dryers configured</option>}
                      {dryers.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.name}{d.capacityKg ? ` (${d.capacityKg} kg)` : ''}
                        </option>
                      ))}
                   </select>
                   {dryers.length === 0 && (
                     <p className="text-[11px] text-slate-500">
                       Add dryers in the list above first.
                     </p>
                   )}
                 </div>
                 <div className="space-y-1">
                   <label className="text-xs font-bold text-slate-500 uppercase">Start Time</label>
                   <input
                     type="datetime-local"
                     required
                     value={newSessionData.startTime}
                     onChange={e => setNewSessionData({...newSessionData, startTime: e.target.value})}
                     className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                   />
                 </div>
                 <div className="space-y-1">
                   <label className="text-xs font-bold text-slate-500 uppercase">Source Block</label>
                   <select
                     value={newSessionData.blockId}
                     onChange={e => setNewSessionData({...newSessionData, blockId: e.target.value})}
                     className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                   >
                      <option value="">Select block…</option>
                      {blocks.map(b => (
                        <option key={b.id} value={b.id}>{b.name}{b.cultivar ? ` (${b.cultivar})` : ''}</option>
                      ))}
                   </select>
                 </div>
                 <div className="grid grid-cols-2 gap-3">
                   <div className="space-y-1">
                     <label className="text-xs font-bold text-slate-500 uppercase">Target %</label>
                     <input
                       type="number"
                       step="0.1"
                       required
                       value={newSessionData.targetMoisture}
                       onChange={e => setNewSessionData({...newSessionData, targetMoisture: parseFloat(e.target.value)})}
                       className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-bold"
                     />
                   </div>
                   <div className="space-y-1">
                     <label className="text-xs font-bold text-slate-500 uppercase">Initial %</label>
                     <input
                       type="number"
                       step="0.1"
                       placeholder="Optional"
                       value={newSessionData.initialMoisture}
                       onChange={e => setNewSessionData({...newSessionData, initialMoisture: e.target.value})}
                       className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                     />
                   </div>
                 </div>
                 <button
                   type="submit"
                   disabled={dryers.length === 0}
                   className="w-full py-3 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-colors mt-2 disabled:opacity-40"
                 >
                   Start drying
                 </button>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
  );
}
