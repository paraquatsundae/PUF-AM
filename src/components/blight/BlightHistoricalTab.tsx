import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BookOpen, FileDown, History, Loader2 } from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { seasonMonthsList, type BlightTimeRange } from '../../lib/blightSeason';
import {
  INCUBATION_MAX_DAYS,
  INCUBATION_MIN_DAYS,
  JI_HIGH_RISK_THRESHOLD,
} from '../../lib/jiBlightBands';
import type { DailyData } from '../../lib/blightModel';
import type { WeatherSource } from '../../lib/weatherService';
import type { BlightHistoricalStats } from '../../hooks/useBlightModelSeries';
import { BlightChartTooltip } from './BlightChartTooltip';

export function BlightHistoricalTab({
  selectedSeason,
  setSelectedSeason,
  availableSeasons,
  timeRange,
  setTimeRange,
  customStartMonth,
  setCustomStartMonth,
  customEndMonth,
  setCustomEndMonth,
  historicalStats,
  historicalSprays,
  blocks,
  isLoadingWeather,
  isDebouncing,
  weatherSource,
  compareWithPrevious,
  setCompareWithPrevious,
  onExportPdf,
  isExporting,
  chartRef,
  chartData,
  filteredHistoricalData,
}: {
  selectedSeason: string;
  setSelectedSeason: (s: string) => void;
  availableSeasons: string[];
  timeRange: BlightTimeRange;
  setTimeRange: (r: BlightTimeRange) => void;
  customStartMonth: number;
  setCustomStartMonth: (n: number) => void;
  customEndMonth: number;
  setCustomEndMonth: (n: number) => void;
  historicalStats: BlightHistoricalStats;
  historicalSprays: { id: string; date: string; blockId?: string; sprayType?: string }[];
  blocks: { id: string; name?: string }[];
  isLoadingWeather: boolean;
  isDebouncing: boolean;
  weatherSource: WeatherSource;
  compareWithPrevious: boolean;
  setCompareWithPrevious: (v: boolean) => void;
  onExportPdf: () => void;
  isExporting: boolean;
  chartRef: React.RefObject<HTMLDivElement>;
  chartData: DailyData[];
  filteredHistoricalData: DailyData[];
}) {
  const handleExportPDF = onExportPdf;
  return (
        <div className="space-y-6 animate-in fade-in duration-300">
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            Past seasons — when risk spiked and how sprays lined up.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            
            {/* Left Sidebar: Historical Controls & Stats */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="font-semibold text-slate-900 mb-4">Analysis Period</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Season</label>
                    <select
                      value={selectedSeason}
                      onChange={(e) => setSelectedSeason(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm"
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
                              ? 'bg-slate-900 text-white border-slate-900' 
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {range}
                        </button>
                      ))}
                      <button
                        onClick={() => setTimeRange('Custom')}
                        className={`col-span-4 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                          timeRange === 'Custom' 
                            ? 'bg-slate-900 text-white border-slate-900' 
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        Custom Month Range
                      </button>
                    </div>
                  </div>

                  {timeRange === 'Custom' && (
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Start Month</label>
                        <select
                          value={customStartMonth}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setCustomStartMonth(val);
                            if (val > customEndMonth) setCustomEndMonth(val);
                          }}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm"
                        >
                          {seasonMonthsList.map((m, i) => <option key={m} value={i}>{m}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">End Month</label>
                        <select
                          value={customEndMonth}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setCustomEndMonth(val);
                            if (val < customStartMonth) setCustomStartMonth(val);
                          }}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm"
                        >
                          {seasonMonthsList.map((m, i) => <option key={m} value={i}>{m}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="font-semibold text-slate-900 mb-4">Period Summary</h3>
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-1">High Risk Days</p>
                    <div className="flex items-end gap-2">
                      <p className="text-3xl font-bold text-rose-600 leading-none">{historicalStats.highRiskDays}</p>
                      <p className="text-sm text-slate-500 mb-0.5">days &gt; {JI_HIGH_RISK_THRESHOLD} Ji index</p>
                    </div>
                  </div>
                  <div className="h-px bg-slate-100 w-full"></div>
                  <div>
                    <p className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-1">Sprays Applied</p>
                    <div className="flex items-end gap-2">
                      <p className="text-3xl font-bold text-emerald-600 leading-none">{historicalStats.totalSprays}</p>
                      <p className="text-sm text-slate-500 mb-0.5">applications</p>
                    </div>
                  </div>
                  <div className="h-px bg-slate-100 w-full"></div>
                  <div>
                    <p className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-1">Avg Threat Level</p>
                    <p className="text-3xl font-bold text-slate-900 leading-none">{historicalStats.avgThreat}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <History className="w-5 h-5 text-slate-700" />
                    <h2 className="font-semibold text-slate-900">Historical Spray Records</h2>
                  </div>
                </div>
                
                <div className="space-y-3 mb-4 max-h-[200px] overflow-y-auto pr-2">
                  {historicalSprays.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">No historical sprays recorded.</p>
                  ) : (
                    historicalSprays.map((event) => {
                      const block = blocks.find(b => b.id === event.blockId);
                      const blockName = block ? block.name : 'General';
                      return (
                        <div key={event.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                          <div className="text-right w-full">
                            <div className="flex justify-between items-start">
                              <p className="text-sm font-medium text-slate-900">{new Date(`${event.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 uppercase">
                                {blockName}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 mt-1 justify-end">
                              <span className="text-xs font-medium capitalize text-slate-600">
                                {event.sprayType === 'both' ? 'Chemical + Biological' : event.sprayType}
                              </span>
                              {event.sprayType === 'both' && (
                                <div className="group relative">
                                  <AlertTriangle className="w-3 h-3 text-amber-500 cursor-help" />
                                  <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-slate-800 text-white text-[10px] rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                    Tank-mix note for operators — not modelled as reduced efficacy on this historical chart.
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100">
                  <Link 
                    to="/diary"
                    className="flex items-center justify-center w-full py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
                  >
                    <BookOpen className="w-4 h-4 mr-2" />
                    Manage in Farm Diary
                  </Link>
                </div>
              </div>
            </div>

            {/* Right Content: Historical Chart */}
            <div className="lg:col-span-3">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col relative overflow-hidden">
                {(isLoadingWeather || isDebouncing) && (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center">
                    <div className="flex flex-col items-center text-emerald-700">
                      <Loader2 className="w-8 h-8 animate-spin mb-2" />
                      <p className="font-medium">
                        {isLoadingWeather ? `Fetching ${weatherSource} weather data...` : 'Recalculating historical models...'}
                      </p>
                    </div>
                  </div>
                )}
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Historical blight pressure</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      Ji infection risk (red) for {timeRange === 'Custom' ? `${seasonMonthsList[customStartMonth]} - ${seasonMonthsList[customEndMonth]}` : `past ${timeRange}`} · Season {selectedSeason}. Amber = expected symptom window ({INCUBATION_MIN_DAYS}–{INCUBATION_MAX_DAYS} d incubation lag) — when to scout. Diary sprays are markers only.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg flex-1 sm:flex-none justify-center sm:justify-start">
                      <input 
                        type="checkbox" 
                        id="compare-prev"
                        checked={compareWithPrevious}
                        onChange={(e) => setCompareWithPrevious(e.target.checked)}
                        className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                      />
                      <label htmlFor="compare-prev" className="text-sm font-medium text-slate-700 cursor-pointer whitespace-nowrap">
                        Compare with Prev. Season
                      </label>
                    </div>
                    <button
                      onClick={handleExportPDF}
                      disabled={isExporting}
                      className="flex-1 sm:flex-none flex items-center justify-center px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      {isExporting ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <FileDown className="w-4 h-4 mr-2" />
                      )}
                      {isExporting ? 'Generating...' : 'Export PDF Report'}
                    </button>
                  </div>
                </div>

                {/* Stage-Aware Breakdown */}
                <div className="mb-8">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-emerald-500" />
                    Risk by calendar phenology stage
                  </h3>
                  <p className="text-[11px] text-slate-500 mb-3">
                    Same May–Aug dormant → Oct bloom schedule the model uses — not a separate harvest calendar.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {historicalStats.stageBreakdown.map((stage) => (
                      <div key={stage.name} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                        <div className={`text-[10px] font-bold uppercase tracking-tighter mb-2 px-2 py-0.5 rounded-full inline-block ${stage.color} ${stage.textColor}`}>
                          {stage.name}
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] text-slate-500">Avg Risk</span>
                            <span className="text-xs font-semibold text-slate-900">{stage.avgThreat}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] text-slate-500">Sprays</span>
                            <span className="text-xs font-semibold text-blue-600">{stage.sprays}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] text-slate-500">Critical</span>
                            <span className="text-xs font-semibold text-rose-600">{stage.highRiskDays}d</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="w-full h-[400px]" ref={chartRef}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={[...chartData].sort((a, b) => a.timestamp - b.timestamp)} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis 
                        dataKey="timestamp" 
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
                        domain={[0, 'auto']} 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#64748b', fontSize: 12 }} 
                      />
                      <Tooltip content={<BlightChartTooltip />} />
                      <Legend verticalAlign="top" height={36} iconType="circle" />
                      
                      <Area 
                        type="monotone" 
                        dataKey="threat" 
                        name="Infection risk (Ji)" 
                        fill="#ef4444" 
                        fillOpacity={0.3} 
                        stroke="#ef4444" 
                        strokeWidth={1} 
                      />
                      <Area
                        type="monotone"
                        dataKey="symptomOnset"
                        name={`Expected symptoms (+${INCUBATION_MIN_DAYS}–${INCUBATION_MAX_DAYS}d)`}
                        fill="#f59e0b"
                        fillOpacity={0.12}
                        stroke="#f59e0b"
                        strokeWidth={1}
                        strokeDasharray="4 3"
                      />
                      {compareWithPrevious && (
                        <Area 
                          type="monotone" 
                          dataKey="prevThreat" 
                          name="Prev. season pressure" 
                          fill="#94a3b8" 
                          fillOpacity={0.1} 
                          stroke="#94a3b8" 
                          strokeWidth={1} 
                          strokeDasharray="5 5"
                        />
                      )}

                      {/* Diary spray markers (reference only — not modelled efficacy) */}
                      {historicalSprays.map((event) => {
                        const isInRange = filteredHistoricalData.some(d => d.fullDate === event.date);
                        if (!isInRange) return null;
                        
                        return (
                          <ReferenceLine 
                            key={event.id} 
                            x={new Date(`${event.date}T12:00:00Z`).getTime()} 
                            stroke="#8b5cf6" 
                            strokeDasharray="3 3" 
                            label={{ position: 'top', value: 'SPRAY', fill: '#8b5cf6', fontSize: 10, fontWeight: 'bold' }} 
                          />
                        );
                      })}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>
  );
}
