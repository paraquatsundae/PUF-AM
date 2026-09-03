import React from 'react';
import { History, Settings2, Sparkles } from 'lucide-react';
import { seasonMonthsList, type BlightTimeRange } from './blightSeason';
import type { SprayType } from './blightModel';
import type { CalibrationParams } from './modelParameters';
import type { SandboxScenario } from './useBlightSandbox';

export function BlightSandboxSidebar({
  sandboxView,
  selectedSeason,
  setSelectedSeason,
  availableSeasons,
  timeRange,
  setTimeRange,
  customStartMonth,
  setCustomStartMonth,
  customEndMonth,
  setCustomEndMonth,
  handleAutoDistribute,
  activeScenario,
  setSandboxHeight,
  setSandboxWidth,
  setSandboxSpacing,
  debouncedParams,
}: {
  sandboxView: 'forecast' | 'historical';
  selectedSeason: string;
  setSelectedSeason: (s: string) => void;
  availableSeasons: string[];
  timeRange: BlightTimeRange;
  setTimeRange: (r: BlightTimeRange) => void;
  customStartMonth: number;
  setCustomStartMonth: (n: number) => void;
  customEndMonth: number;
  setCustomEndMonth: (n: number) => void;
  handleAutoDistribute: (type?: SprayType) => void;
  activeScenario: SandboxScenario;
  setSandboxHeight: (n: number | null) => void;
  setSandboxWidth: (n: number | null) => void;
  setSandboxSpacing: (n: number | null) => void;
  debouncedParams: { calib: CalibrationParams };
}) {
  return (
            <div className="lg:col-span-4 lg:sticky lg:top-6 lg:h-fit space-y-6">
              {sandboxView === 'historical' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                  <h3 className="font-semibold text-slate-900 mb-4 flex items-center">
                    <History className="w-4 h-4 mr-2 text-indigo-500" />
                    Analysis Period
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Season</label>
                      <select
                        value={selectedSeason}
                        onChange={(e) => setSelectedSeason(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
                      >
                        {availableSeasons.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Time Range</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                        {(['1M', '3M', '6M', '1Y'] as const).map(range => (
                          <button
                            key={range}
                            onClick={() => setTimeRange(range)}
                            className={`py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                              timeRange === range 
                                ? 'bg-indigo-600 text-white border-indigo-600' 
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {range}
                          </button>
                        ))}
                        <button
                          onClick={() => setTimeRange('Custom')}
                          className={`col-span-2 sm:col-span-4 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                            timeRange === 'Custom' 
                              ? 'bg-indigo-600 text-white border-indigo-600' 
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Custom Range
                        </button>
                      </div>
                    </div>

                    {timeRange === 'Custom' && (
                      <div className="space-y-3 pt-2 border-t border-slate-100">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Start Month</label>
                          <select 
                            value={customStartMonth}
                            onChange={(e) => setCustomStartMonth(parseInt(e.target.value))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
                          >
                            {seasonMonthsList.map((m, i) => <option key={i} value={i} disabled={i > customEndMonth}>{m}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">End Month</label>
                          <select 
                            value={customEndMonth}
                            onChange={(e) => setCustomEndMonth(parseInt(e.target.value))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
                          >
                            {seasonMonthsList.map((m, i) => <option key={i} value={i} disabled={i < customStartMonth}>{m}</option>)}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="font-semibold text-slate-900 mb-4 flex items-center">
                  <Sparkles className="w-4 h-4 mr-2 text-emerald-500" />
                  Smart Simulation
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Automatically calculate the optimal spray schedule to keep blight risk below the 0.8 threshold.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <button 
                    onClick={() => handleAutoDistribute('chem')}
                    className="w-full py-3 bg-emerald-50 text-emerald-600 font-bold rounded-lg hover:bg-emerald-100 transition-all text-sm flex items-center justify-center gap-2 border border-emerald-100 shadow-sm"
                  >
                    <Sparkles className="w-4 h-4" />
                    Auto-Distribute Chemicals
                  </button>
                  <button 
                    onClick={() => handleAutoDistribute('bio')}
                    className="w-full py-3 bg-blue-50 text-blue-600 font-bold rounded-lg hover:bg-blue-100 transition-all text-sm flex items-center justify-center gap-2 border border-blue-100 shadow-sm"
                  >
                    <Sparkles className="w-4 h-4" />
                    Auto-Distribute Biologicals
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-900 flex items-center">
                    <Settings2 className="w-4 h-4 mr-2 text-indigo-500" />
                    Canopy Adjustments
                  </h3>
                  {(activeScenario.treeHeight !== null || activeScenario.canopyWidth !== null || activeScenario.rowSpacing !== null) && (
                    <button 
                      onClick={() => { setSandboxHeight(null); setSandboxWidth(null); setSandboxSpacing(null); }}
                      className="text-xs text-slate-400 hover:text-rose-500 font-medium"
                    >
                      Reset
                    </button>
                  )}
                </div>
                
                <div className="space-y-4">
                  <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl space-y-1 mb-2">
                    <div className="flex justify-between items-center">
                      <p className="text-[10px] font-bold text-slate-700 uppercase font-mono">Calculated TRV</p>
                      <span className="text-sm font-bold text-indigo-600 font-mono">
                        {Math.round(
                          ((activeScenario.treeHeight || debouncedParams.calib.treeHeight) * 
                           (activeScenario.canopyWidth || debouncedParams.calib.canopyWidth) * 10000) / 
                           (activeScenario.rowSpacing || debouncedParams.calib.rowSpacing)
                        ).toLocaleString()} m³/ha
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Tree Height (m)
                      {activeScenario.treeHeight !== null && <span className="text-indigo-600 ml-2">(Modified)</span>}
                    </label>
                    <input 
                      type="range" 
                      min="1" max="20" step="0.1"
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      value={activeScenario.treeHeight === null ? debouncedParams.calib.treeHeight : activeScenario.treeHeight}
                      onChange={(e) => setSandboxHeight(parseFloat(e.target.value))}
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                      <span>1m</span>
                      <span className="font-bold text-slate-700">{activeScenario.treeHeight === null ? debouncedParams.calib.treeHeight : activeScenario.treeHeight}m</span>
                      <span>20m</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Canopy Width (m)
                      {activeScenario.canopyWidth !== null && <span className="text-indigo-600 ml-2">(Modified)</span>}
                    </label>
                    <input 
                      type="range" 
                      min="1" max="10" step="0.1"
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      value={activeScenario.canopyWidth === null ? debouncedParams.calib.canopyWidth : activeScenario.canopyWidth}
                      onChange={(e) => setSandboxWidth(parseFloat(e.target.value))}
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                      <span>1m</span>
                      <span className="font-bold text-slate-700">{activeScenario.canopyWidth === null ? debouncedParams.calib.canopyWidth : activeScenario.canopyWidth}m</span>
                      <span>10m</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Row Spacing (m)
                      {activeScenario.rowSpacing !== null && <span className="text-indigo-600 ml-2">(Modified)</span>}
                    </label>
                    <input 
                      type="range" 
                      min="3" max="15" step="0.5"
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      value={activeScenario.rowSpacing === null ? debouncedParams.calib.rowSpacing : activeScenario.rowSpacing}
                      onChange={(e) => setSandboxSpacing(parseFloat(e.target.value))}
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                      <span>3m</span>
                      <span className="font-bold text-slate-700">{activeScenario.rowSpacing === null ? debouncedParams.calib.rowSpacing : activeScenario.rowSpacing}m</span>
                      <span>15m</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
  );
}
