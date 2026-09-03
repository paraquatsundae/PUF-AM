import React from 'react';
import { Bug, Droplets, Sparkles } from 'lucide-react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SandboxMatrix } from './SandboxMatrix';
import { filterSandboxScenarioDays, getCurrentSeasonStr } from './blightSeason';
import type { DailyData, SprayType } from './blightModel';
import type { SandboxScenario } from './useBlightSandbox';
import { BlightChartTooltip } from './BlightChartTooltip';

export function BlightSandboxChart({
  sandboxView,
  scenarios,
  compareAllScenarios,
  activeScenarioId,
  allData,
  todayStr,
  todayDate,
  filteredHistoricalData,
  sandboxScenariosData,
  selectedSeason,
  sandboxUseSecondaryLatency,
  activeScenario,
  historicalStats,
  sandboxHistoricalStats,
  handleAutoDistribute,
  setSandboxSprays,
  setSandboxIrrigation,
}: {
  sandboxView: 'forecast' | 'historical';
  scenarios: SandboxScenario[];
  compareAllScenarios: boolean;
  activeScenarioId: string;
  allData: DailyData[];
  todayStr: string;
  todayDate: Date;
  filteredHistoricalData: DailyData[];
  sandboxScenariosData: Record<string, DailyData[]>;
  selectedSeason: string;
  sandboxUseSecondaryLatency: boolean;
  activeScenario: SandboxScenario;
  historicalStats: { highRiskDays: number; totalSprays: number; avgThreat: string };
  sandboxHistoricalStats: Record<string, { highRiskDays: number; totalSprays: number; avgThreat: string }>;
  handleAutoDistribute: (type?: SprayType) => void;
  setSandboxSprays: (sprays: SandboxScenario['sprays']) => void;
  setSandboxIrrigation: (irrigation: SandboxScenario['irrigation']) => void;
}) {
  /**
   * Chart-level data, needed only by the eruption bars.
   *
   * Every other series carries its own `data`, which recharts honours on Line
   * and Area but not on Bar — its Bar reads the chart's data or nothing. So the
   * bars need a dataset here, and the active scenario is the one to use: when
   * comparing scenarios the lines fan out but the eruption bars stay pinned to
   * the scenario being edited, which is what the spray controls act on.
   */
  const activeScenarioData = React.useMemo(
    () =>
      filterSandboxScenarioDays(sandboxScenariosData[activeScenarioId] || [], {
        sandboxView,
        todayStr,
        selectedSeason,
      }),
    [sandboxScenariosData, activeScenarioId, sandboxView, todayStr, selectedSeason]
  );

  return (
            <div className="lg:col-span-8">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Scenario Comparison</h2>
                    <p className="text-sm text-slate-500">Compare your baseline data with simulated scenarios.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                      <span className="text-xs font-medium text-slate-600">Baseline</span>
                    </div>
                    {scenarios.map(s => (
                      (compareAllScenarios || s.id === activeScenarioId) && (
                        <div key={s.id} className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }}></div>
                          <span className="text-xs font-medium text-slate-600">{s.name}</span>
                        </div>
                      )
                    ))}
                    <div className="h-4 w-px bg-slate-200 mx-1"></div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-px bg-slate-400 border-t border-dashed border-slate-400 rotate-90"></div>
                      <span className="text-xs font-medium text-slate-600">Sim. Spray</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-px bg-blue-500 border-t border-dashed border-blue-500 rotate-90"></div>
                      <span className="text-xs font-medium text-slate-600">Sim. Irrigation</span>
                    </div>
                  </div>
                </div>

                <div className="w-full h-[500px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={activeScenarioData}
                      margin={{ top: 20, right: 20, bottom: 20, left: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis 
                        dataKey="timestamp" 
                        xAxisId="baseline"
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#64748b', fontSize: 12 }} 
                        dy={10}
                        tickFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        minTickGap={40}
                      />
                      <YAxis 
                        domain={[0, sandboxView === 'forecast' ? 1.5 : 'auto']} 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#64748b', fontSize: 12 }} 
                      />
                      {/*
                        Both pinned to `baseline`, the axis every series uses.
                        Unpinned they bind to the implicit axis 0, which had no
                        scale while the chart carried no data of its own. Now
                        that it does, the tooltip would slice each series'
                        payload to the active scenario's row count — reporting
                        one date's threat under another's — and the threshold
                        line would appear and vanish with the scenario.
                      */}
                      <Tooltip content={<BlightChartTooltip />} axisId="baseline" />
                      <ReferenceLine y={1.0} xAxisId="baseline" stroke="#ef4444" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Critical Threshold', fill: '#ef4444', fontSize: 10 }} />
                      
                        <Line 
                          type="monotone" 
                          data={[...(sandboxView === 'forecast' ? allData.filter(d => d.fullDate >= todayStr) : filteredHistoricalData)].sort((a, b) => a.timestamp - b.timestamp)} 
                          dataKey="threat" 
                          xAxisId="baseline"
                          name="Baseline Threat" 
                          stroke="#ef4444" 
                          strokeWidth={2} 
                          dot={false} 
                          activeDot={{ r: 4 }} 
                        />

                        {scenarios.map(s => {
                          if (!compareAllScenarios && s.id !== activeScenarioId) return null;
                          const scenarioData = sandboxScenariosData[s.id] || [];
                          const filteredData = filterSandboxScenarioDays(scenarioData, {
                            sandboxView,
                            todayStr,
                            selectedSeason,
                          });

                        return (
                          <React.Fragment key={s.id}>
                            <Line 
                              type="monotone" 
                              data={filteredData} 
                              dataKey="threat" 
                              xAxisId="baseline"
                              name={s.name} 
                              stroke={s.color} 
                              strokeWidth={s.id === activeScenarioId ? 3 : 2} 
                              strokeDasharray={s.id === activeScenarioId ? "0" : "5 5"}
                              dot={false} 
                              activeDot={{ r: 6 }} 
                            />
                            {s.id === activeScenarioId && (
                              <>
                                <Line
                                  type="monotone"
                                  data={filteredData}
                                  dataKey="chem"
                                  xAxisId="baseline"
                                  name="Chemical efficacy (hyp.)"
                                  stroke="#3b82f6"
                                  strokeWidth={2}
                                  dot={false}
                                  activeDot={{ r: 4 }}
                                />
                                <Line
                                  type="monotone"
                                  data={filteredData}
                                  dataKey="bio"
                                  xAxisId="baseline"
                                  name="Biological efficacy (hyp.)"
                                  stroke="#22c55e"
                                  strokeWidth={2}
                                  dot={false}
                                  activeDot={{ r: 4 }}
                                />
                                {sandboxUseSecondaryLatency && (
                                  <>
                                    <Area
                                      type="monotone"
                                      data={filteredData}
                                      dataKey="latentThreat"
                                      xAxisId="baseline"
                                      name="Incubating (exp.)"
                                      fill="#fef3c7"
                                      fillOpacity={0.4}
                                      stroke="#f59e0b"
                                      strokeWidth={1}
                                      strokeDasharray="5 5"
                                    />
                                    {/*
                                      Reads the chart's `data`, not this
                                      scenario's: recharts ignores `data` on Bar.
                                      See `activeScenarioData` above.
                                    */}
                                    <Bar
                                      dataKey="eruptingThreat"
                                      xAxisId="baseline"
                                      name="Eruptions (exp.)"
                                      fill="#b91c1c"
                                      barSize={4}
                                    />
                                  </>
                                )}
                              </>
                            )}
                          </React.Fragment>
                        );
                      })}

                      {/* Render reference lines for active scenario sprays */}
                      {activeScenario?.sprays && Object.keys(activeScenario.sprays).map(date => (
                        <ReferenceLine 
                          key={`sandbox-spray-${date}`} 
                          x={new Date(`${date}T12:00:00Z`).getTime()} 
                          xAxisId="baseline"
                          stroke={activeScenario.color} 
                          strokeDasharray="3 3" 
                        />
                      ))}

                      {/* Render reference lines for active scenario irrigation */}
                      {activeScenario?.irrigation && Object.keys(activeScenario.irrigation).map(date => (
                        <ReferenceLine 
                          key={`sandbox-irrigation-${date}`} 
                          x={new Date(`${date}T12:00:00Z`).getTime()} 
                          xAxisId="baseline"
                          stroke="#3b82f6" 
                          strokeDasharray="3 3" 
                        />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Scenario Scorecard */}
                <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Total Sprays</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">Baseline</span>
                        <span className="text-sm font-bold text-slate-900">{historicalStats.totalSprays}</span>
                      </div>
                      {scenarios.map(s => (compareAllScenarios || s.id === activeScenarioId) && (
                        <div key={s.id} className="flex justify-between items-center">
                          <span className="text-sm text-slate-600">{s.name}</span>
                          <span className="text-sm font-bold" style={{ color: s.color }}>{sandboxHistoricalStats[s.id]?.totalSprays || 0}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">High Risk Days</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">Baseline</span>
                        <span className="text-sm font-bold text-slate-900">{historicalStats.highRiskDays}</span>
                      </div>
                      {scenarios.map(s => (compareAllScenarios || s.id === activeScenarioId) && (
                        <div key={s.id} className="flex justify-between items-center">
                          <span className="text-sm text-slate-600">{s.name}</span>
                          <span className="text-sm font-bold" style={{ color: s.color }}>{sandboxHistoricalStats[s.id]?.highRiskDays || 0}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Avg. Threat Level</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">Baseline</span>
                        <span className="text-sm font-bold text-slate-900">{historicalStats.avgThreat}</span>
                      </div>
                      {scenarios.map(s => (compareAllScenarios || s.id === activeScenarioId) && (
                        <div key={s.id} className="flex justify-between items-center">
                          <span className="text-sm text-slate-600">{s.name}</span>
                          <span className="text-sm font-bold" style={{ color: s.color }}>{sandboxHistoricalStats[s.id]?.avgThreat || '0.00'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Full-width Sandbox Matrices */}
              {(sandboxView === 'historical' || sandboxView === 'forecast') && (
                <div className="mt-8 space-y-6">
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-slate-900 flex items-center">
                        <Bug className="w-5 h-5 mr-2 text-indigo-500" />
                        Hypothetical Sprays
                      </h3>
                      <button 
                        // Arg-less on purpose: passing this straight to onClick
                        // feeds a MouseEvent to its `type` parameter.
                        onClick={() => handleAutoDistribute()}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-100"
                        title="Auto-plan sprays to keep risk below 0.8"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Auto-Distribute
                      </button>
                    </div>
                    <SandboxMatrix 
                      season={sandboxView === 'historical' ? selectedSeason : getCurrentSeasonStr(todayDate)} 
                      type="spray" 
                      data={activeScenario.sprays} 
                      onChange={setSandboxSprays} 
                    />
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center">
                      <Droplets className="w-5 h-5 mr-2 text-indigo-500" />
                      Hypothetical Irrigation
                    </h3>
                    <SandboxMatrix 
                      season={sandboxView === 'historical' ? selectedSeason : getCurrentSeasonStr(todayDate)} 
                      type="irrigation" 
                      data={activeScenario.irrigation} 
                      onChange={setSandboxIrrigation} 
                    />
                  </div>
                </div>
              )}
            </div>
  );
}
