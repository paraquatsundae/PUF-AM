import React, { useMemo, useRef, useState } from 'react';
import { History, LineChart as LineChartIcon, Settings2 } from 'lucide-react';
import { useUsageTracking } from '../hooks/useUsageTracking';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';
import { type SprayType } from '../lib/blightModel';
import { WALNUT_DISTRICTS, SEASONS } from '../constants';
import { getCurrentSeasonStr, todayDateStr, type BlightTimeRange } from '../lib/blightSeason';
import { exportBlightHistoricalPdf } from '../lib/blightHistoricalPdf';
import { useFarmDiary } from '../lib/farmDiary';
import { useMapStore } from '../lib/mapStore';
import { useBlightModelParams } from '../hooks/useBlightModelParams';
import { useBlightWeather } from '../hooks/useBlightWeather';
import { useBlightSandbox } from '../hooks/useBlightSandbox';
import { useBlightModelSeries } from '../hooks/useBlightModelSeries';
import { BlightPageHeader } from '../components/blight/BlightPageHeader';
import { BlightStatusStrip } from '../components/blight/BlightStatusStrip';
import { BlightForecastTab } from '../components/blight/BlightForecastTab';
import { BlightHistoricalTab } from '../components/blight/BlightHistoricalTab';
import { BlightSandboxTab } from '../components/blight/BlightSandboxTab';
import { BlightDevCalibPanel } from '../components/blight/BlightDevCalibPanel';

const availableSeasons = SEASONS;

export function BlightRisk() {
  // Memoised because it is a dependency of the model-series memos below, and a
  // fresh Date on every render makes every one of them recompute — a full
  // season of blight rows rebuilt on each slider tick. The page is remounted
  // daily in practice; it does not need to notice midnight.
  const todayDate = useMemo(() => new Date(), []);
  const todayStr = todayDateStr(todayDate);

  const { userData, isAdmin } = useAuth();
  const farmId = userData?.farmId;
  const { checkLimit, recordUsage, loading: usageLoading } = useUsageTracking();
  const { events, getSprayEvents, getIrrigationEvents, settings } = useFarmDiary();
  const { blocks, viewport } = useMapStore();
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'forecast' | 'historical' | 'sandbox'>('forecast');
  const chartRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState(getCurrentSeasonStr(todayDate));
  const [timeRange, setTimeRange] = useState<BlightTimeRange>('1Y');
  const [customStartMonth, setCustomStartMonth] = useState(0);
  const [customEndMonth, setCustomEndMonth] = useState(11);
  const [compareWithPrevious, setCompareWithPrevious] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [lastCalculated, setLastCalculated] = useState<Date | null>(new Date());

  const {
    growthStage,
    setGrowthStage,
    scoutingStage,
    setScoutingStage,
    showDevPanel,
    setShowDevPanel,
    calib,
    setCalib,
    loadingParams,
    isDebouncing,
    debouncedParams,
  } = useBlightModelParams(farmId, todayDate);

  const {
    weatherSource,
    setWeatherSource,
    locationId,
    setLocationId,
    weatherData,
    forecastWeather,
    forecastUpdatedAt,
    weatherMeta,
    isLoadingWeather,
    isFetchingStations,
    processedStations,
  } = useBlightWeather({ farmId, activeTab, viewport });

  const sprayEvents = useMemo(() => getSprayEvents(selectedBlockId || undefined), [getSprayEvents, selectedBlockId]);
  const irrigationEvents = useMemo(
    () => getIrrigationEvents(selectedBlockId || undefined),
    [getIrrigationEvents, selectedBlockId]
  );

  const {
    sandboxView,
    setSandboxView,
    sandboxUseSecondaryLatency,
    setSandboxUseSecondaryLatency,
    scenarios,
    setScenarios,
    activeScenarioId,
    setActiveScenarioId,
    compareAllScenarios,
    setCompareAllScenarios,
    activeScenario,
    setSandboxSprays,
    setSandboxIrrigation,
    setSandboxHeight,
    setSandboxWidth,
    setSandboxSpacing,
    handleCloneScenario,
    handleAutoDistribute: runAutoDistribute,
  } = useBlightSandbox();

  const handleAutoDistribute = (type: SprayType = 'chem') => {
    runAutoDistribute({
      type,
      selectedSeason,
      todayDate,
      todayStr,
      selectedBlockId,
      blocks,
      weatherData,
      irrigationEvents,
      irrigationSystemType: settings.irrigationSystemType,
      debouncedParams,
    });
  };

  const {
    allData,
    lastObservedDateStr,
    hasRealForecast,
    lastForecastDateStr,
    forecastData,
    sandboxScenariosData,
    sandboxHistoricalStats,
    filteredHistoricalData,
    historicalStats,
    chartData,
    forecastSorted,
    currentRisk,
    todayBand,
    sevenDayOutlook,
    latestEvent,
    currentWeather,
  } = useBlightModelSeries({
    weatherData,
    forecastWeather,
    activeTab,
    sandboxView,
    todayDate,
    todayStr,
    selectedBlockId,
    blocks,
    debouncedParams,
    irrigationEvents,
    sprayEvents,
    irrigationSystemType: settings.irrigationSystemType,
    sandboxUseSecondaryLatency,
    scenarios,
    activeScenarioId,
    compareAllScenarios,
    selectedSeason,
    timeRange,
    customStartMonth,
    customEndMonth,
    compareWithPrevious,
    events,
  });

  const isOverLimit = !usageLoading && !checkLimit('calculations');
  const historicalSprays = events
    .filter((e) => e.type === 'spray' && e.date < todayStr)
    .sort((a, b) => b.date.localeCompare(a.date));
  const lastSprayDate = historicalSprays[0]?.date || 'N/A';
  const daysSinceLastSpray =
    lastSprayDate !== 'N/A'
      ? Math.floor((todayDate.getTime() - new Date(`${lastSprayDate}T12:00:00`).getTime()) / (1000 * 60 * 60 * 24))
      : null;
  const isProtected = daysSinceLastSpray !== null && daysSinceLastSpray <= 14;

  const handleCalculate = async () => {
    if (!checkLimit('calculations')) return;
    setCalculating(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await recordUsage('calculations');
      setLastCalculated(new Date());
    } finally {
      setCalculating(false);
    }
  };

  const handleExportPDF = async () => {
    if (!chartRef.current) return;
    setIsExporting(true);
    try {
      const locationLabel =
        weatherSource === 'DPIRD'
          ? processedStations.find((s) => (s.stationCode || s.code) === locationId)?.stationName || locationId
          : WALNUT_DISTRICTS.find((d) => d.id === locationId)?.name || locationId;
      await exportBlightHistoricalPdf({
        chartEl: chartRef.current,
        farmName: settings.farmName || 'My Farm',
        selectedSeason,
        timeRange,
        customStartMonth,
        customEndMonth,
        historicalStats,
        filteredHistoricalData,
        locationLabel,
      });
    } catch (error) {
      console.error('PDF Export Error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5 pb-24 lg:pb-6">
      <BlightPageHeader
        lastCalculated={lastCalculated}
        calculating={calculating}
        isOverLimit={isOverLimit}
        onRefresh={() => void handleCalculate()}
        selectedBlockId={selectedBlockId}
        setSelectedBlockId={setSelectedBlockId}
        blocks={blocks}
        activeTab={activeTab}
        growthStage={growthStage}
        setGrowthStage={setGrowthStage}
        scoutingStage={scoutingStage}
        setScoutingStage={setScoutingStage}
        todayDate={todayDate}
        weatherSource={weatherSource}
        setWeatherSource={setWeatherSource}
        locationId={locationId}
        setLocationId={setLocationId}
        isFetchingStations={isFetchingStations}
        processedStations={processedStations}
        weatherMeta={weatherMeta}
        farmId={farmId}
        calib={calib}
        setCalib={setCalib}
        isAdmin={Boolean(isAdmin)}
      />

      <BlightStatusStrip
        todayBand={todayBand}
        currentRisk={currentRisk}
        forecastData={forecastData}
        isProtected={isProtected}
        lastSprayDate={lastSprayDate}
        isLoadingWeather={isLoadingWeather}
        currentWeather={currentWeather}
      />

      <div className="inline-flex w-full sm:w-auto items-center gap-0.5 p-0.5 bg-slate-100 rounded-lg">
        {(
          [
            { id: 'forecast' as const, icon: LineChartIcon, title: 'Forecast' },
            { id: 'historical' as const, icon: History, title: 'Historical' },
            { id: 'sandbox' as const, icon: Settings2, title: 'Sandbox' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all',
              activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            )}
          >
            <tab.icon
              className={cn('w-3.5 h-3.5 shrink-0', activeTab === tab.id ? 'text-rose-600' : 'text-slate-400')}
            />
            {tab.title}
          </button>
        ))}
      </div>

      {activeTab === 'forecast' && (
        <BlightForecastTab
          todayBand={todayBand}
          currentRisk={currentRisk}
          latestEvent={latestEvent}
          sevenDayOutlook={sevenDayOutlook}
          hasRealForecast={hasRealForecast}
          lastObservedDateStr={lastObservedDateStr}
          lastForecastDateStr={lastForecastDateStr}
          forecastUpdatedAt={forecastUpdatedAt}
          calculating={calculating}
          isLoadingWeather={isLoadingWeather}
          loadingParams={loadingParams}
          isDebouncing={isDebouncing}
          weatherSource={weatherSource}
          scoutingStage={scoutingStage}
          forecastData={forecastData}
          forecastSorted={forecastSorted}
          setWeatherSource={setWeatherSource}
          onRetryManual={() => void handleCalculate()}
        />
      )}

      {activeTab === 'historical' && (
        <BlightHistoricalTab
          selectedSeason={selectedSeason}
          setSelectedSeason={setSelectedSeason}
          availableSeasons={availableSeasons}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          customStartMonth={customStartMonth}
          setCustomStartMonth={setCustomStartMonth}
          customEndMonth={customEndMonth}
          setCustomEndMonth={setCustomEndMonth}
          historicalStats={historicalStats}
          historicalSprays={historicalSprays}
          blocks={blocks}
          isLoadingWeather={isLoadingWeather}
          isDebouncing={isDebouncing}
          weatherSource={weatherSource}
          compareWithPrevious={compareWithPrevious}
          setCompareWithPrevious={setCompareWithPrevious}
          onExportPdf={() => void handleExportPDF()}
          isExporting={isExporting}
          chartRef={chartRef}
          chartData={chartData}
          filteredHistoricalData={filteredHistoricalData}
        />
      )}

      {activeTab === 'sandbox' && (
        <BlightSandboxTab
          isAdmin={Boolean(isAdmin)}
          farmId={farmId}
          calib={calib}
          setCalib={setCalib}
          sandboxView={sandboxView}
          setSandboxView={setSandboxView}
          scenarios={scenarios}
          setScenarios={setScenarios}
          activeScenarioId={activeScenarioId}
          setActiveScenarioId={setActiveScenarioId}
          sandboxUseSecondaryLatency={sandboxUseSecondaryLatency}
          setSandboxUseSecondaryLatency={setSandboxUseSecondaryLatency}
          compareAllScenarios={compareAllScenarios}
          setCompareAllScenarios={setCompareAllScenarios}
          handleAutoDistribute={handleAutoDistribute}
          handleCloneScenario={handleCloneScenario}
          selectedSeason={selectedSeason}
          setSelectedSeason={setSelectedSeason}
          availableSeasons={availableSeasons}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          customStartMonth={customStartMonth}
          setCustomStartMonth={setCustomStartMonth}
          customEndMonth={customEndMonth}
          setCustomEndMonth={setCustomEndMonth}
          activeScenario={activeScenario}
          setSandboxHeight={setSandboxHeight}
          setSandboxWidth={setSandboxWidth}
          setSandboxSpacing={setSandboxSpacing}
          debouncedParams={debouncedParams}
          allData={allData}
          todayStr={todayStr}
          todayDate={todayDate}
          filteredHistoricalData={filteredHistoricalData}
          sandboxScenariosData={sandboxScenariosData}
          historicalStats={historicalStats}
          sandboxHistoricalStats={sandboxHistoricalStats}
          setSandboxSprays={setSandboxSprays}
          setSandboxIrrigation={setSandboxIrrigation}
        />
      )}

      {showDevPanel && (
        <BlightDevCalibPanel calib={calib} setCalib={setCalib} onClose={() => setShowDevPanel(false)} />
      )}
    </div>
  );
}
