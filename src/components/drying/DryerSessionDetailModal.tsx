import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Save, Download, Thermometer } from 'lucide-react';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Scatter, ResponsiveContainer, ReferenceLine } from 'recharts';
import { format } from 'date-fns';
import { calculateDryingPrediction, type DryingSession } from '../../lib/dryingModel';

function MoistureTooltip({ active, payload }: { active?: boolean; payload?: { payload: Record<string, unknown> }[] }) {
  if (active && payload && payload.length) {
    const p = payload[0].payload as { date: Date; measured: number | null; fitted: number | null; isTarget?: boolean };
    return (
      <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-slate-100">
        <p className="text-xs text-slate-400 mb-1">{format(p.date, "MMM d, h:mm a")}</p>
        {p.measured !== null && <p className="font-bold text-blue-400">Measured: {p.measured}%</p>}
        {p.fitted !== null && <p className="font-medium text-amber-500">Projected: {p.fitted}%</p>}
        {p.isTarget && <p className="font-bold text-red-500 mt-1">Target Reached!</p>}
      </div>
    );
  }
  return null;
}

export function DryerSessionDetailModal({
  session,
  blocks,
  isExporting,
  activeModalTab,
  setActiveModalTab,
  ambientTemperatures,
  fetchingAmbient,
  newReadingData,
  setNewReadingData,
  editingReadingIndex,
  setEditingReadingIndex,
  editReadingData,
  setEditReadingData,
  newTempReadingData,
  setNewTempReadingData,
  editingTempIndex,
  setEditingTempIndex,
  editTempData,
  setEditTempData,
  onClose,
  onExportPDF,
  onMarkComplete,
  onAddReading,
  onUpdateReading,
  onDeleteReading,
  onAddTempReading,
  onUpdateTempReading,
  onDeleteTempReading,
  onDeleteSession,
  onComments,
}: {
  session: DryingSession | null;
  blocks: { id: string; name: string }[];
  isExporting: boolean;
  activeModalTab: 'moisture' | 'temperature';
  setActiveModalTab: (tab: 'moisture' | 'temperature') => void;
  ambientTemperatures: { time: string; temperature: number }[];
  fetchingAmbient: boolean;
  newReadingData: { moisture: string; time: string; note: string };
  setNewReadingData: React.Dispatch<React.SetStateAction<{ moisture: string; time: string; note: string }>>;
  editingReadingIndex: number | null;
  setEditingReadingIndex: (i: number | null) => void;
  editReadingData: { moisture: string; time: string; note: string };
  setEditReadingData: React.Dispatch<React.SetStateAction<{ moisture: string; time: string; note: string }>>;
  newTempReadingData: { temperature: string; time: string; note: string };
  setNewTempReadingData: React.Dispatch<React.SetStateAction<{ temperature: string; time: string; note: string }>>;
  editingTempIndex: number | null;
  setEditingTempIndex: (i: number | null) => void;
  editTempData: { temperature: string; time: string; note: string };
  setEditTempData: React.Dispatch<React.SetStateAction<{ temperature: string; time: string; note: string }>>;
  onClose: () => void;
  onExportPDF: () => void;
  onMarkComplete: () => void;
  onAddReading: (e: React.FormEvent) => void;
  onUpdateReading: (index: number) => void;
  onDeleteReading: (index: number) => void;
  onAddTempReading: (e: React.FormEvent) => void;
  onUpdateTempReading: (index: number) => void;
  onDeleteTempReading: (index: number) => void;
  onDeleteSession: (id: string) => void;
  onComments: (text: string) => void;
}) {
  if (!session) return null;
  const selectedSession = session;
  const setSelectedSession = (v: DryingSession | null) => {
    if (!v) onClose();
  };
  const handleExportPDF = onExportPDF;
  const handleMarkComplete = onMarkComplete;
  const handleAddReading = onAddReading;
  const handleUpdateReading = onUpdateReading;
  const handleDeleteReading = onDeleteReading;
  const handleAddTempReading = onAddTempReading;
  const handleUpdateTempReading = onUpdateTempReading;
  const handleDeleteTempReading = onDeleteTempReading;
  const handleDeleteSession = onDeleteSession;
  const CustomTooltip = MoistureTooltip;

  return (
      <AnimatePresence>
        {selectedSession && (
          <div className="fixed inset-0 z-[6000] flex justify-end p-0 sm:p-4">
             <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedSession(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full sm:w-[600px] h-full bg-white sm:rounded-2xl shadow-2xl flex flex-col"
            >
              <div className="flex-none p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-slate-900">Bin {selectedSession.binNumber}</h2>
                  {selectedSession.blockId && (
                    <p className="text-sm font-medium text-slate-500">
                      {blocks.find(b => b.id === selectedSession.blockId)?.name || 'Unknown Block'}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportPDF}
                    disabled={isExporting}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    {isExporting ? 'Exporting...' : 'Export'}
                  </button>
                  {selectedSession.status === 'active' && (
                     <button
                     onClick={handleMarkComplete}
                     className="px-3 py-1.5 text-xs font-bold bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
                   >
                     Mark Complete
                   </button>
                  )}
                  <button onClick={() => setSelectedSession(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                    <X className="w-5 h-5 text-slate-500" />
                  </button>
                </div>
              </div>

              <div className="px-6 pt-4 border-b border-slate-100 flex space-x-4">
                <button
                  onClick={() => setActiveModalTab('moisture')}
                  className={`pb-3 text-sm font-bold border-b-2 transition-all ${
                    activeModalTab === 'moisture'
                      ? 'border-emerald-500 text-emerald-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Moisture Tracking
                </button>
                <button
                  onClick={() => setActiveModalTab('temperature')}
                  className={`pb-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
                    activeModalTab === 'temperature'
                      ? 'border-emerald-500 text-emerald-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Thermometer className="w-4 h-4" />
                  Temperature Profile
                </button>
              </div>

              <div id="pdf-export-content" className="flex-1 overflow-y-auto p-6 space-y-6 bg-white">
                 {/* General Comments */}
                 <div className="mb-2">
                   <h3 className="text-sm font-bold text-slate-900 mb-2">General Comments</h3>
                   <textarea
                     value={selectedSession.generalComments || ''}
                     onChange={(e) => onComments(e.target.value)}
                     placeholder="Add any general notes for this bin..."
                     disabled={selectedSession.status !== 'active'}
                     className="w-full text-sm p-3 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none min-h-[80px]"
                   />
                 </div>

                 {activeModalTab === 'moisture' ? (
                   <>
                     {/* Chart */}
                     <div>
                        <h3 className="text-sm font-bold text-slate-900 mb-4">Drying Curve - Target {selectedSession.targetMoisture}%</h3>
                        <div className="h-[300px] w-full border border-slate-100 rounded-xl p-2 bg-slate-50">
                      {(() => {
                         const prediction = calculateDryingPrediction(selectedSession.readings, selectedSession.targetMoisture);
                         
                         // If no prediction, just plot raw points
                         const data = prediction?.plotData || selectedSession.readings.map(r => ({
                           hours: (new Date(r.time).getTime() - new Date(selectedSession.startTime).getTime()) / (1000 * 60 * 60),
                           measured: r.moisture,
                           date: new Date(r.time)
                         }));

                         if (data.length === 0) {
                           return <div className="h-full flex items-center justify-center text-slate-400 text-sm">No readings yet.</div>;
                         }

                         return (
                           <ResponsiveContainer width="100%" height="100%">
                              <ComposedChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis 
                                  dataKey="hours" 
                                  type="number" 
                                  domain={['dataMin', 'dataMax']}
                                  tickFormatter={(v) => `${v.toFixed(0)}h`}
                                  axisLine={false}
                                  tickLine={false}
                                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                                  label={{ value: 'Time (hours from start)', position: 'insideBottom', offset: -15, fill: '#64748b', fontSize: 12 }}
                                />
                                <YAxis 
                                  domain={['auto', 'auto']}
                                  axisLine={false}
                                  tickLine={false}
                                  tickFormatter={(v) => `${v}%`}
                                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                                  label={{ value: 'Moisture (%)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 12 }}
                                />
                                <Tooltip content={<CustomTooltip />} />
                                <ReferenceLine y={selectedSession.targetMoisture} stroke="#10b981" strokeDasharray="3 3" />
                                
                                {prediction && (
                                  <Line 
                                    type="monotone" 
                                    dataKey="fitted" 
                                    stroke="#f59e0b" 
                                    strokeWidth={2} 
                                    dot={false} 
                                    isAnimationActive={false}
                                  />
                                )}
                                
                                <Scatter dataKey="measured" fill="#3b82f6" shape="circle" isAnimationActive={false} />
                                <Scatter dataKey="targetY" fill="#ef4444" shape="star" isAnimationActive={false} />
                              </ComposedChart>
                           </ResponsiveContainer>
                         );
                      })()}
                    </div>
                 </div>

                 {/* Readings Log & Form */}
                 <div>
                    <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center justify-between">
                      Reading Log
                      {selectedSession.status === 'active' && (
                        <span className="text-xs font-normal text-slate-500">Latest reading adjusts curve</span>
                      )}
                    </h3>

                     {selectedSession.status === 'active' && (
                      <form onSubmit={handleAddReading} className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4 flex flex-col gap-3">
                         <div className="flex items-end gap-3">
                           <div className="flex-1">
                             <label className="text-[10px] font-bold text-blue-800 uppercase tracking-wider mb-1 block">Time</label>
                             <input
                               type="datetime-local"
                               required
                               value={newReadingData.time}
                               onChange={e => setNewReadingData({...newReadingData, time: e.target.value})}
                               className="w-full p-2 bg-white border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                             />
                           </div>
                           <div className="flex-1">
                             <label className="text-[10px] font-bold text-blue-800 uppercase tracking-wider mb-1 block">Moisture %</label>
                             <input
                               type="number"
                               step="0.1"
                               required
                               placeholder="e.g. 11.2"
                               value={newReadingData.moisture}
                               onChange={e => setNewReadingData({...newReadingData, moisture: e.target.value})}
                               className="w-full p-2 bg-white border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                             />
                           </div>
                         </div>
                         <div className="flex items-end gap-3">
                           <div className="flex-1">
                             <label className="text-[10px] font-bold text-blue-800 uppercase tracking-wider mb-1 block">Operator Note (Optional)</label>
                             <input
                               type="text"
                               placeholder="e.g. Closed vent on bin 2..."
                               value={newReadingData.note}
                               onChange={e => setNewReadingData({...newReadingData, note: e.target.value})}
                               className="w-full p-2 bg-white border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                             />
                           </div>
                           <button type="submit" className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors h-[38px]">
                             Add
                           </button>
                         </div>
                      </form>
                    )}

                    <div className="space-y-2">
                       {[...selectedSession.readings].sort((a,b) => new Date(b.time).getTime() - new Date(a.time).getTime()).map((r, i) => (
                         <div key={i} className="flex flex-col sm:flex-row sm:items-start justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 gap-2">
                           {editingReadingIndex === i ? (
                              <div className="flex-1 flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="datetime-local" 
                                    className="flex-1 p-1.5 border border-slate-200 rounded text-sm w-full"
                                    value={editReadingData.time}
                                    onChange={e => setEditReadingData({...editReadingData, time: e.target.value})}
                                  />
                                  <input 
                                    type="number" 
                                    step="0.1" 
                                    className="w-20 p-1.5 border border-slate-200 rounded text-sm"
                                    value={editReadingData.moisture}
                                    onChange={e => setEditReadingData({...editReadingData, moisture: e.target.value})}
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    placeholder="Note"
                                    className="flex-1 p-1.5 border border-slate-200 rounded text-sm"
                                    value={editReadingData.note}
                                    onChange={e => setEditReadingData({...editReadingData, note: e.target.value})}
                                  />
                                  <button onClick={() => handleUpdateReading(i)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"><Save className="w-4 h-4" /></button>
                                  <button onClick={() => setEditingReadingIndex(null)} className="p-1.5 text-slate-400 hover:bg-slate-200 rounded"><X className="w-4 h-4" /></button>
                                </div>
                              </div>
                           ) : (
                             <>
                               <div className="flex-1">
                                 <span className="text-sm text-slate-500 font-medium block">{format(new Date(r.time), "MMM d, yyyy - h:mm a")}</span>
                                 {r.note && <span className="text-sm text-slate-600 italic block mt-1">{r.note}</span>}
                               </div>
                               <div className="flex items-start sm:items-center gap-4 mt-2 sm:mt-0">
                                 <span className="font-bold text-slate-900 text-lg">{r.moisture}%</span>
                                 {selectedSession.status === 'active' && (
                                   <div className="flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity">
                                     <button 
                                       onClick={() => {
                                         setEditReadingData({ time: format(new Date(r.time), "yyyy-MM-dd'T'HH:mm"), moisture: r.moisture.toString(), note: r.note || '' });
                                         setEditingReadingIndex(i);
                                       }} 
                                       className="text-xs text-blue-600 hover:underline"
                                     >Edit</button>
                                     <span className="text-slate-300">|</span>
                                     <button onClick={() => handleDeleteReading(i)} className="text-xs text-rose-600 hover:underline">Delete</button>
                                   </div>
                                 )}
                               </div>
                             </>
                           )}
                         </div>
                       ))}
                       {selectedSession.readings.length === 0 && (
                         <p className="text-sm text-slate-400 text-center py-4">No readings recorded yet.</p>
                       )}
                    </div>
                 </div>
                 </>
                 ) : (
                   <div className="space-y-8">
                     {/* Temperature Chart */}
                     <div>
                        <h3 className="text-sm font-bold text-slate-900 mb-4">Temperature Profile (°C)</h3>
                        <div className="h-[300px] w-full border border-slate-100 rounded-xl p-2 bg-slate-50">
                          {(() => {
                            const dataMap = new Map();
                            
                            ambientTemperatures.forEach(t => {
                              dataMap.set(t.time, { time: new Date(t.time), ambient: t.temperature });
                            });
                            
                            (selectedSession.temperatureReadings || []).forEach(r => {
                              // Find closest hour or exact match, simplify by just putting it in the map
                              // We can just rely on the time as key if we round it, but let's just use raw ISO string for sort
                              const existing = dataMap.get(r.time) || { time: new Date(r.time) };
                              dataMap.set(r.time, { ...existing, bin: r.temperature });
                            });

                            const data = Array.from(dataMap.values())
                              .sort((a,b) => a.time.getTime() - b.time.getTime())
                              .map(d => ({
                                ...d,
                                hours: (d.time.getTime() - new Date(selectedSession.startTime).getTime()) / (1000 * 60 * 60)
                              }));

                            if (data.length === 0 && fetchingAmbient) {
                              return <div className="h-full flex items-center justify-center text-slate-400 text-sm">Fetching ambient temperatures...</div>;
                            } else if (data.length === 0) {
                              return <div className="h-full flex items-center justify-center text-slate-400 text-sm">No temperature data available.</div>;
                            }

                            return (
                              <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                  <XAxis 
                                    dataKey="hours" 
                                    type="number" 
                                    domain={['dataMin', 'dataMax']}
                                    tickFormatter={(v) => `${v.toFixed(0)}h`}
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                                    label={{ value: 'Time (hours from start)', position: 'insideBottom', offset: -15, fill: '#64748b', fontSize: 12 }}
                                  />
                                  <YAxis 
                                    domain={['auto', 'auto']}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(v) => `${v}°`}
                                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                                    label={{ value: 'Temperature (°C)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 12 }}
                                  />
                                  <Tooltip 
                                    content={({ active, payload }) => {
                                      if (active && payload && payload.length) {
                                        const p = payload[0].payload;
                                        return (
                                          <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-slate-100">
                                            <p className="text-xs text-slate-400 mb-1">{format(p.time, "MMM d, h:mm a")}</p>
                                            {p.ambient !== undefined && <p className="font-medium text-slate-300">Ambient: {p.ambient}°C</p>}
                                            {p.bin !== undefined && <p className="font-bold text-orange-400">Bin Temp: {p.bin}°C</p>}
                                          </div>
                                        );
                                      }
                                      return null;
                                    }}
                                  />
                                  <Line type="monotone" dataKey="ambient" stroke="#94a3b8" strokeWidth={2} dot={false} name="Ambient Temp" isAnimationActive={false} />
                                  <Scatter dataKey="bin" fill="#f97316" shape="circle" name="Bin Temp" isAnimationActive={false} />
                                  <Line type="stepAfter" dataKey="bin" stroke="#f97316" strokeDasharray="3 3" strokeWidth={1} dot={false} isAnimationActive={false} />
                                </ComposedChart>
                              </ResponsiveContainer>
                            );
                          })()}
                        </div>
                     </div>

                     {/* Temperature Log & Form */}
                     <div>
                        <h3 className="text-sm font-bold text-slate-900 mb-4">Bin Temperature Log</h3>
                        {selectedSession.status === 'active' && (
                          <form onSubmit={handleAddTempReading} className="bg-orange-50 border border-orange-100 rounded-xl p-4 mb-4 flex flex-col gap-3">
                             <div className="flex items-end gap-3">
                               <div className="flex-1">
                                 <label className="text-[10px] font-bold text-orange-800 uppercase tracking-wider mb-1 block">Time</label>
                                 <input
                                   type="datetime-local"
                                   required
                                   value={newTempReadingData.time}
                                   onChange={e => setNewTempReadingData({...newTempReadingData, time: e.target.value})}
                                   className="w-full p-2 bg-white border border-orange-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                                 />
                               </div>
                               <div className="flex-1">
                                 <label className="text-[10px] font-bold text-orange-800 uppercase tracking-wider mb-1 block">Temperature (°C)</label>
                                 <input
                                   type="number"
                                   step="0.1"
                                   required
                                   placeholder="e.g. 38.5"
                                   value={newTempReadingData.temperature}
                                   onChange={e => setNewTempReadingData({...newTempReadingData, temperature: e.target.value})}
                                   className="w-full p-2 bg-white border border-orange-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none font-bold"
                                 />
                               </div>
                             </div>
                             <div className="flex items-end gap-3">
                               <div className="flex-1">
                                 <label className="text-[10px] font-bold text-orange-800 uppercase tracking-wider mb-1 block">Operator Note (Optional)</label>
                                 <input
                                   type="text"
                                   placeholder="e.g. Adjusted heating element..."
                                   value={newTempReadingData.note}
                                   onChange={e => setNewTempReadingData({...newTempReadingData, note: e.target.value})}
                                   className="w-full p-2 bg-white border border-orange-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                                 />
                               </div>
                               <button type="submit" className="px-4 py-2 bg-orange-600 text-white font-bold rounded-lg hover:bg-orange-700 transition-colors h-[38px]">
                                 Add
                               </button>
                             </div>
                          </form>
                        )}

                        <div className="space-y-2">
                           {[...(selectedSession.temperatureReadings || [])].sort((a,b) => new Date(b.time).getTime() - new Date(a.time).getTime()).map((r, i) => (
                             <div key={i} className="flex flex-col sm:flex-row sm:items-start justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 gap-2">
                               {editingTempIndex === i ? (
                                  <div className="flex-1 flex flex-col gap-2">
                                    <div className="flex items-center gap-2">
                                      <input 
                                        type="datetime-local" 
                                        className="flex-1 p-1.5 border border-slate-200 rounded text-sm w-full"
                                        value={editTempData.time}
                                        onChange={e => setEditTempData({...editTempData, time: e.target.value})}
                                      />
                                      <input 
                                        type="number" 
                                        step="0.1" 
                                        className="w-20 p-1.5 border border-slate-200 rounded text-sm"
                                        value={editTempData.temperature}
                                        onChange={e => setEditTempData({...editTempData, temperature: e.target.value})}
                                      />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        placeholder="Note"
                                        className="flex-1 p-1.5 border border-slate-200 rounded text-sm"
                                        value={editTempData.note}
                                        onChange={e => setEditTempData({...editTempData, note: e.target.value})}
                                      />
                                      <button onClick={() => handleUpdateTempReading(i)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"><Save className="w-4 h-4" /></button>
                                      <button onClick={() => setEditingTempIndex(null)} className="p-1.5 text-slate-400 hover:bg-slate-200 rounded"><X className="w-4 h-4" /></button>
                                    </div>
                                  </div>
                               ) : (
                                 <>
                                   <div className="flex-1">
                                     <span className="text-sm text-slate-500 font-medium block">{format(new Date(r.time), "MMM d, yyyy - h:mm a")}</span>
                                     {r.note && <span className="text-sm text-slate-600 italic block mt-1">{r.note}</span>}
                                   </div>
                                   <div className="flex items-start sm:items-center gap-4 mt-2 sm:mt-0">
                                     <span className="font-bold text-slate-900 text-lg">{r.temperature}°C</span>
                                     {selectedSession.status === 'active' && (
                                       <div className="flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity">
                                         <button 
                                           onClick={() => {
                                             setEditTempData({ time: format(new Date(r.time), "yyyy-MM-dd'T'HH:mm"), temperature: r.temperature.toString(), note: r.note || '' });
                                             setEditingTempIndex(i);
                                           }} 
                                           className="text-xs text-blue-600 hover:underline"
                                         >Edit</button>
                                         <span className="text-slate-300">|</span>
                                         <button onClick={() => handleDeleteTempReading(i)} className="text-xs text-rose-600 hover:underline">Delete</button>
                                       </div>
                                     )}
                                   </div>
                                 </>
                               )}
                             </div>
                           ))}
                           {!(selectedSession.temperatureReadings?.length) && (
                             <p className="text-sm text-slate-400 text-center py-4">No bin temperatures recorded yet.</p>
                           )}
                        </div>
                     </div>
                   </div>
                 )}
                 
                 <div className="pt-8 border-t border-slate-100 flex justify-end">
                    <button 
                      onClick={() => handleDeleteSession(selectedSession.id)}
                      className="text-sm text-slate-400 hover:text-rose-600 font-medium transition-colors"
                    >
                      Delete Session
                    </button>
                 </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
  );
}
