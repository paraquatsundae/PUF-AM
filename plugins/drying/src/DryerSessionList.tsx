import React from 'react';
import { Plus, Maximize2, TrendingDown, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { calculateDryingPrediction, type DryingSession } from './dryingModel';
import type { FarmDryer } from '../../../src/lib/farmAssets';

export function DryerSessionList({
  sessions,
  dryers,
  blocks,
  onStart,
  onSelect,
}: {
  sessions: DryingSession[];
  dryers: FarmDryer[];
  blocks: { id: string; name: string; cultivar: string }[];
  onStart: () => void;
  onSelect: (session: DryingSession) => void;
}) {
  const activeSessions = sessions.filter((s) => s.status === 'active');
  const completedSessions = sessions.filter((s) => s.status === 'completed');
  const setShowAddSession = (open: boolean) => {
    if (open) onStart();
  };
  const setSelectedSession = onSelect;

  return (

    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Pick a configured dryer, source block, and log moisture over time.
          {dryers.length === 0 && (
            <>
              {' '}
              <span className="text-emerald-800 font-medium">
                Add dryers in the list above
              </span>
              .
            </>
          )}
        </p>
        <button
          onClick={() => setShowAddSession(true)}
          disabled={dryers.length === 0}
          className="flex items-center justify-center gap-2 bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-40"
        >
          <Plus className="w-4 h-4" />
          Start drying
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="bg-slate-50 rounded-xl border border-dashed border-slate-200 p-8 text-center">
          <TrendingDown className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-900 mb-1">No drying sessions</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {dryers.length === 0
              ? 'Add dryers in the list above, then start a session here.'
              : 'Start a session to log moisture readings and predict target time.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
           {/* Active Bins Bento Box */}
           {activeSessions.length > 0 && (
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Active Bins
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeSessions.map(session => {
                  const prediction = calculateDryingPrediction(session.readings, session.targetMoisture);
                  const lastReading = session.readings.length > 0 
                    ? [...session.readings].sort((a,b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0]
                    : null;
                  
                  return (
                    <div 
                      key={session.id}
                      onClick={() => setSelectedSession(session)}
                      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 cursor-pointer hover:border-emerald-500 hover:shadow-md transition-all group relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Maximize2 className="w-4 h-4 text-emerald-600" />
                      </div>
                      
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h4 className="text-2xl font-black text-slate-900">Bin {session.binNumber}</h4>
                          {session.blockId && (
                            <p className="text-sm font-medium text-emerald-600">
                              {blocks.find(b => b.id === session.blockId)?.name || 'Unknown Block'}
                            </p>
                          )}
                        </div>
                        <div className="bg-slate-50 px-3 py-1 rounded-full border border-slate-100 flex flex-col items-end">
                           <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Target</span>
                           <span className="text-sm font-black text-slate-700">{session.targetMoisture.toFixed(1)}%</span>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-end gap-3">
                          <div className="flex-1">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Current Moisture</p>
                            <p className="text-3xl font-black text-slate-900">
                              {lastReading ? `${lastReading.moisture.toFixed(1)}%` : '--'}
                            </p>
                          </div>
                          {prediction && (
                            <div className="flex-1 text-right">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Drying Temp</p>
                              <div className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                                <TrendingDown className="w-3.5 h-3.5" />
                                <span className="text-sm font-bold">Good</span>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="pt-4 border-t border-slate-100">
                          {prediction ? (
                            <div className="flex items-start gap-3">
                              <Clock className={`w-5 h-5 shrink-0 mt-0.5 ${isPast(prediction.targetDate) ? 'text-rose-500' : 'text-amber-500'}`} />
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Estimated Completion</p>
                                <p className="text-sm font-bold text-slate-900">
                                  {format(prediction.targetDate, "h:mm a, MMM d")}
                                </p>
                                <p className={`text-xs font-medium ${isPast(prediction.targetDate) ? 'text-rose-600' : 'text-amber-600'}`}>
                                  {isPast(prediction.targetDate) ? 'Overdue - Check Bin!' : `In ${formatDistanceToNow(prediction.targetDate)}`}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start gap-3 opacity-50">
                              <AlertCircle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Estimated Completion</p>
                                <p className="text-xs font-medium text-slate-500">Need at least 2 readings...</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
           )}

           {/* Completed History */}
           {completedSessions.length > 0 && (
             <div>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">
                  Completed Sessions
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {completedSessions.map(session => {
                    const lastReading = session.readings.length > 0 
                      ? [...session.readings].sort((a,b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0]
                      : null;
                    return (
                      <div 
                        key={session.id}
                        onClick={() => setSelectedSession(session)}
                        className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:bg-slate-50 transition-colors flex items-center justify-between"
                      >
                        <div>
                          <p className="font-bold text-slate-900">Bin {session.binNumber}</p>
                          <p className="text-xs text-slate-500">{format(new Date(session.startTime), 'MMM d, yyyy')}</p>
                        </div>
                        <div className="text-right flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span className="font-black text-slate-700">{lastReading?.moisture.toFixed(1)}%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
             </div>
           )}
        </div>
      )}
    </div>
  );
}
