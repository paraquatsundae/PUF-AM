import React from 'react';
import { RefreshCw, Settings2, Sparkles, X } from 'lucide-react';
import { BlightResearchModifiersPanel } from './BlightResearchModifiersPanel';
import { BlightSandboxSidebar } from './BlightSandboxSidebar';
import { BlightSandboxChart } from './BlightSandboxChart';
import type { CalibrationParams } from '../../lib/modelParameters';
import type { DailyData, SprayType } from '../../lib/blightModel';
import type { BlightTimeRange } from '../../lib/blightSeason';
import type { SandboxScenario } from '../../hooks/useBlightSandbox';

export function BlightSandboxTab({
  isAdmin,
  farmId,
  calib,
  setCalib,
  sandboxView,
  setSandboxView,
  scenarios,
  setScenarios,
  activeScenarioId,
  setActiveScenarioId,
  sandboxUseSecondaryLatency,
  setSandboxUseSecondaryLatency,
  compareAllScenarios,
  setCompareAllScenarios,
  handleAutoDistribute,
  handleCloneScenario,
  selectedSeason,
  setSelectedSeason,
  availableSeasons,
  timeRange,
  setTimeRange,
  customStartMonth,
  setCustomStartMonth,
  customEndMonth,
  setCustomEndMonth,
  activeScenario,
  setSandboxHeight,
  setSandboxWidth,
  setSandboxSpacing,
  debouncedParams,
  allData,
  todayStr,
  todayDate,
  filteredHistoricalData,
  sandboxScenariosData,
  historicalStats,
  sandboxHistoricalStats,
  setSandboxSprays,
  setSandboxIrrigation,
}: {
  isAdmin: boolean;
  farmId: string | undefined;
  calib: CalibrationParams;
  setCalib: React.Dispatch<React.SetStateAction<CalibrationParams>>;
  sandboxView: 'forecast' | 'historical';
  setSandboxView: (v: 'forecast' | 'historical') => void;
  scenarios: SandboxScenario[];
  setScenarios: React.Dispatch<React.SetStateAction<SandboxScenario[]>>;
  activeScenarioId: string;
  setActiveScenarioId: (id: string) => void;
  sandboxUseSecondaryLatency: boolean;
  setSandboxUseSecondaryLatency: (v: boolean) => void;
  compareAllScenarios: boolean;
  setCompareAllScenarios: (v: boolean) => void;
  handleAutoDistribute: (type?: SprayType) => void;
  handleCloneScenario: (id: string) => void;
  selectedSeason: string;
  setSelectedSeason: (s: string) => void;
  availableSeasons: string[];
  timeRange: BlightTimeRange;
  setTimeRange: (r: BlightTimeRange) => void;
  customStartMonth: number;
  setCustomStartMonth: (n: number) => void;
  customEndMonth: number;
  setCustomEndMonth: (n: number) => void;
  activeScenario: SandboxScenario;
  setSandboxHeight: (n: number | null) => void;
  setSandboxWidth: (n: number | null) => void;
  setSandboxSpacing: (n: number | null) => void;
  debouncedParams: { calib: CalibrationParams };
  allData: DailyData[];
  todayStr: string;
  todayDate: Date;
  filteredHistoricalData: DailyData[];
  sandboxScenariosData: Record<string, DailyData[]>;
  historicalStats: { highRiskDays: number; totalSprays: number; avgThreat: string };
  sandboxHistoricalStats: Record<string, { highRiskDays: number; totalSprays: number; avgThreat: string }>;
  setSandboxSprays: (sprays: SandboxScenario['sprays']) => void;
  setSandboxIrrigation: (irrigation: SandboxScenario['irrigation']) => void;
}) {
  return (
        <div className="space-y-6 animate-in fade-in duration-300">
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Settings2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            What-if sprays and hypothetical chem/bio efficacy — not used on Forecast or Historical.
            Optional “Latency / secondary” is experimental and also sandbox-only.
          </p>

          {isAdmin && (
            <BlightResearchModifiersPanel
              farmId={farmId}
              calib={calib}
              onCalibChange={setCalib}
            />
          )}

          <div className="flex items-center justify-between">
            <div className="flex bg-slate-100 p-1 rounded-lg w-fit">
              <button
                onClick={() => setSandboxView('forecast')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${sandboxView === 'forecast' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Forecast Sandbox
              </button>
              <button
                onClick={() => setSandboxView('historical')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${sandboxView === 'historical' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Historical Sandbox
              </button>
            </div>
          </div>

          {/* Scenario Manager Toolbar */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
                {scenarios.map(scenario => (
                  <button
                    key={scenario.id}
                    onClick={() => setActiveScenarioId(scenario.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
                      activeScenarioId === scenario.id 
                        ? 'bg-indigo-600 text-white shadow-md' 
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: scenario.color }}></div>
                    {scenario.name}
                  </button>
                ))}
                <button 
                  onClick={() => {
                    const newId = (scenarios.length + 1).toString();
                    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
                    setScenarios([...scenarios, { 
                      id: newId, 
                      name: `Scenario ${newId}`, 
                      sprays: {}, 
                      irrigation: {}, 
                      treeHeight: null, 
                      canopyWidth: null,
                      rowSpacing: null,
                      color: colors[scenarios.length % colors.length]
                    }]);
                    setActiveScenarioId(newId);
                  }}
                  className="px-3 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-all"
                >
                  + Add
                </button>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-xs font-medium text-slate-500" title="Experimental GDD latency queue + secondary threat bump. Off on Forecast/Historical.">
                    Latency / secondary
                  </span>
                  <button
                    type="button"
                    onClick={() => setSandboxUseSecondaryLatency(!sandboxUseSecondaryLatency)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${sandboxUseSecondaryLatency ? 'bg-amber-500' : 'bg-slate-300'}`}
                    aria-pressed={sandboxUseSecondaryLatency}
                  >
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${sandboxUseSecondaryLatency ? 'left-6' : 'left-1'}`}></div>
                  </button>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-xs font-medium text-slate-500">Compare All</span>
                  <button 
                    onClick={() => setCompareAllScenarios(!compareAllScenarios)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${compareAllScenarios ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${compareAllScenarios ? 'left-6' : 'left-1'}`}></div>
                  </button>
                </div>
                
                <div className="h-8 w-px bg-slate-200"></div>
                
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleAutoDistribute}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-emerald-100"
                    title="Auto-plan sprays to keep risk below 0.8"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Auto-Plan
                  </button>
                  <button 
                    onClick={() => {
                      const other = scenarios.find(s => s.id !== activeScenarioId);
                      if (other) handleCloneScenario(other.id);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Clone from Other
                  </button>
                  <button 
                    onClick={() => {
                      setScenarios(prev => prev.map(s => s.id === activeScenarioId ? { ...s, sprays: {}, irrigation: {} } : s));
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    Clear
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <BlightSandboxSidebar
              sandboxView={sandboxView}
              selectedSeason={selectedSeason}
              setSelectedSeason={setSelectedSeason}
              availableSeasons={availableSeasons}
              timeRange={timeRange}
              setTimeRange={setTimeRange}
              customStartMonth={customStartMonth}
              setCustomStartMonth={setCustomStartMonth}
              customEndMonth={customEndMonth}
              setCustomEndMonth={setCustomEndMonth}
              handleAutoDistribute={handleAutoDistribute}
              activeScenario={activeScenario}
              setSandboxHeight={setSandboxHeight}
              setSandboxWidth={setSandboxWidth}
              setSandboxSpacing={setSandboxSpacing}
              debouncedParams={debouncedParams}
            />
            <BlightSandboxChart
              sandboxView={sandboxView}
              scenarios={scenarios}
              compareAllScenarios={compareAllScenarios}
              activeScenarioId={activeScenarioId}
              allData={allData}
              todayStr={todayStr}
              todayDate={todayDate}
              filteredHistoricalData={filteredHistoricalData}
              sandboxScenariosData={sandboxScenariosData}
              selectedSeason={selectedSeason}
              sandboxUseSecondaryLatency={sandboxUseSecondaryLatency}
              activeScenario={activeScenario}
              historicalStats={historicalStats}
              sandboxHistoricalStats={sandboxHistoricalStats}
              handleAutoDistribute={handleAutoDistribute}
              setSandboxSprays={setSandboxSprays}
              setSandboxIrrigation={setSandboxIrrigation}
            />
          </div>
        </div>
  );
}
