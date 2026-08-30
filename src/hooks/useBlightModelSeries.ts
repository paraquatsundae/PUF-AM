import { useMemo } from 'react';
import { SEASONS } from '../constants';
import {
  growthStageFromDate,
  growthStageLabel,
  resolveCanopyGeometry,
  runBlightModel,
  SH_WALNUT_PHENOLOGY_BY_MONTH,
  type ApplicationMethod,
  type CalibrationParams,
  type DailyData,
  type GrowthStage,
  type SprayType,
  type WeatherData,
} from '../lib/blightModel';
import { runJiBlightSeries } from '../lib/runJiBlightSeries';
import { kFromInoculumLevel } from '../../shared/weather/jiBlightModel';
import {
  bandFromRisk,
  computeSymptomOnsetSeries,
  detectInfectionEvents,
  JI_HIGH_RISK_THRESHOLD,
  summarizeNext7Days,
} from '../lib/jiBlightBands';
import {
  addDaysIso,
  BLIGHT_STAGE_CHIP,
  filterBySeasonAndRange,
  FORECAST_HORIZON_DAYS,
  mergeObservedAndForecast,
  type BlightTimeRange,
} from '../lib/blightSeason';
import type { SandboxScenario } from './useBlightSandbox';

export type BlightStageBreakdown = {
  name: string;
  stage: GrowthStage;
  color: string;
  textColor: string;
  avgThreat: string;
  sprays: number;
  highRiskDays: number;
  count: number;
};

export type BlightHistoricalStats = {
  highRiskDays: number;
  totalSprays: number;
  avgThreat: string;
  stageBreakdown: BlightStageBreakdown[];
};

export function useBlightModelSeries({
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
  irrigationSystemType,
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
}: {
  weatherData: Record<string, WeatherData>;
  forecastWeather: Record<string, WeatherData>;
  activeTab: 'forecast' | 'historical' | 'sandbox';
  sandboxView: 'forecast' | 'historical';
  todayDate: Date;
  todayStr: string;
  selectedBlockId: string | null;
  blocks: { id: string; treeHeight?: number; canopyWidth?: number; rowSpacing?: number }[];
  debouncedParams: { growthStage: GrowthStage; calib: CalibrationParams };
  irrigationEvents: Record<string, number>;
  sprayEvents: Record<string, { type: SprayType; method: ApplicationMethod }>;
  irrigationSystemType: 'micro' | 'surface_drip' | 'sub_surface' | 'flood' | undefined;
  sandboxUseSecondaryLatency: boolean;
  scenarios: SandboxScenario[];
  activeScenarioId: string;
  compareAllScenarios: boolean;
  selectedSeason: string;
  timeRange: BlightTimeRange;
  customStartMonth: number;
  customEndMonth: number;
  compareWithPrevious: boolean;
  events: { type: string; date: string }[];
}) {
  const modelWeather = useMemo(
    () => mergeObservedAndForecast(weatherData || {}, forecastWeather),
    [weatherData, forecastWeather]
  );

  const allData = useMemo(() => {
    if (!weatherData || Object.keys(weatherData).length === 0) return [];
    let startYear: number;
    if (activeTab === 'forecast' || (activeTab === 'sandbox' && sandboxView === 'forecast')) {
      startYear = parseInt(SEASONS[0].split('-')[0], 10);
    } else {
      startYear = parseInt(SEASONS[SEASONS.length - 1].split('-')[0], 10);
    }
    const startDate = new Date(`${startYear}-06-01T12:00:00Z`);
    const endDate = new Date(todayDate);
    endDate.setDate(endDate.getDate() + 30);

    if (activeTab === 'sandbox') {
      const selectedBlock = selectedBlockId ? blocks.find((b) => b.id === selectedBlockId) : null;
      const canopy = resolveCanopyGeometry({
        selectedBlock,
        blocks,
        fallback: {
          treeHeight: debouncedParams.calib.treeHeight,
          canopyWidth: debouncedParams.calib.canopyWidth,
          rowSpacing: debouncedParams.calib.rowSpacing,
        },
      });
      const canopyCoverage = Math.min(1, canopy.canopyWidth / canopy.rowSpacing);
      return runBlightModel(
        startDate,
        endDate,
        debouncedParams.growthStage,
        {},
        weatherData,
        irrigationEvents,
        irrigationSystemType,
        {
          ...debouncedParams.calib,
          treeHeight: canopy.treeHeight,
          canopyWidth: canopy.canopyWidth,
          rowSpacing: canopy.rowSpacing,
          cropCoefficient: 0.2 + 0.8 * canopyCoverage,
        },
        {
          includeProtection: false,
          phenologyMode: 'calendar',
          useCanopyMicroclimate: canopy.useCanopyMicroclimate,
        }
      );
    }

    return runJiBlightSeries(startDate, endDate, modelWeather, {
      orchard: { k: kFromInoculumLevel(debouncedParams.calib.orchardInoculumLevel) },
      doseMode: 'cumulativeY',
    });
  }, [
    weatherData,
    modelWeather,
    activeTab,
    sandboxView,
    todayDate,
    selectedBlockId,
    blocks,
    debouncedParams,
    irrigationEvents,
    irrigationSystemType,
  ]);

  const historicalData = useMemo(
    () => allData.filter((d) => d.fullDate <= todayStr),
    [allData, todayStr]
  );

  const lastObservedDateStr = useMemo(() => {
    const observedKeys = Object.keys(weatherData).filter((k) => k <= todayStr);
    return observedKeys.length ? observedKeys.sort()[observedKeys.length - 1] : todayStr;
  }, [weatherData, todayStr]);

  const forecastKeys = useMemo(
    () => Object.keys(forecastWeather).filter((k) => k > lastObservedDateStr).sort(),
    [forecastWeather, lastObservedDateStr]
  );
  const hasRealForecast = forecastKeys.length > 0;
  const lastForecastDateStr = hasRealForecast ? forecastKeys[forecastKeys.length - 1] : undefined;
  const forecastHorizonEndStr = useMemo(() => {
    if (lastForecastDateStr) return lastForecastDateStr;
    return addDaysIso(lastObservedDateStr, FORECAST_HORIZON_DAYS);
  }, [lastObservedDateStr, lastForecastDateStr]);

  const forecastData = useMemo(
    () =>
      allData
        .filter((d) => d.fullDate >= todayStr && d.fullDate <= forecastHorizonEndStr)
        .map((d) => {
          const isForecast = d.fullDate > lastObservedDateStr && !!forecastWeather[d.fullDate];
          return { ...d, isForecast, isPersistence: d.fullDate > lastObservedDateStr && !isForecast };
        }),
    [allData, todayStr, forecastHorizonEndStr, lastObservedDateStr, forecastWeather]
  );

  const sandboxScenariosData = useMemo(() => {
    if (activeTab !== 'sandbox' || !weatherData || Object.keys(weatherData).length === 0) return {};
    const startYear =
      sandboxView === 'forecast'
        ? parseInt(SEASONS[0].split('-')[0], 10)
        : parseInt(SEASONS[SEASONS.length - 1].split('-')[0], 10);
    const startDate = new Date(`${startYear}-06-01T12:00:00Z`);
    const endDate = new Date(todayDate);
    endDate.setDate(endDate.getDate() + 30);
    const results: Record<string, DailyData[]> = {};

    scenarios.forEach((scenario) => {
      if (!compareAllScenarios && scenario.id !== activeScenarioId) return;
      const canopy = resolveCanopyGeometry({
        selectedBlock: selectedBlockId ? blocks.find((b) => b.id === selectedBlockId) : null,
        blocks,
        overrides: {
          treeHeight: scenario.treeHeight,
          canopyWidth: scenario.canopyWidth,
          rowSpacing: scenario.rowSpacing,
        },
        fallback: {
          treeHeight: debouncedParams.calib.treeHeight,
          canopyWidth: debouncedParams.calib.canopyWidth,
          rowSpacing: debouncedParams.calib.rowSpacing,
        },
      });
      const scenarioCoverage = Math.min(1, canopy.canopyWidth / canopy.rowSpacing);
      const combinedSprays = { ...sprayEvents, ...scenario.sprays };
      const combinedIrrigation = { ...irrigationEvents, ...scenario.irrigation };
      results[scenario.id] = runBlightModel(
        startDate,
        endDate,
        debouncedParams.growthStage,
        combinedSprays,
        weatherData,
        combinedIrrigation,
        irrigationSystemType,
        {
          ...debouncedParams.calib,
          treeHeight: canopy.treeHeight,
          canopyWidth: canopy.canopyWidth,
          rowSpacing: canopy.rowSpacing,
          cropCoefficient: 0.2 + 0.8 * scenarioCoverage,
        },
        {
          includeProtection: true,
          phenologyMode: 'fixed',
          useCanopyMicroclimate: canopy.useCanopyMicroclimate,
          useSecondaryLatency: sandboxUseSecondaryLatency,
        }
      );
    });
    return results;
  }, [
    debouncedParams,
    sprayEvents,
    irrigationEvents,
    irrigationSystemType,
    sandboxUseSecondaryLatency,
    weatherData,
    activeTab,
    blocks,
    selectedBlockId,
    scenarios,
    activeScenarioId,
    compareAllScenarios,
    sandboxView,
    todayDate,
  ]);

  const sandboxModelData = useMemo(
    () => sandboxScenariosData[activeScenarioId] || [],
    [sandboxScenariosData, activeScenarioId]
  );

  const rangeOpts = {
    selectedSeason,
    timeRange,
    customStartMonth,
    customEndMonth,
  };

  const sandboxHistoricalStats = useMemo(() => {
    const results: Record<string, { highRiskDays: number; totalSprays: number; avgThreat: string }> = {};
    Object.keys(sandboxScenariosData).forEach((id) => {
      const data = sandboxScenariosData[id];
      const seasonData = filterBySeasonAndRange<DailyData>(data, { ...rangeOpts, todayStr });
      const highRiskDays = seasonData.filter((d) => d.threat > JI_HIGH_RISK_THRESHOLD).length;
      const totalSprays = seasonData.filter((d) => d.isSprayDay).length;
      const avgThreat = seasonData.length
        ? (seasonData.reduce((acc, curr) => acc + curr.threat, 0) / seasonData.length).toFixed(2)
        : '0.00';
      results[id] = { highRiskDays, totalSprays, avgThreat };
    });
    return results;
  }, [sandboxScenariosData, selectedSeason, timeRange, customStartMonth, customEndMonth, todayStr]);

  const sandboxForecastData = useMemo(
    () => sandboxModelData.filter((d) => d.fullDate >= todayStr),
    [sandboxModelData, todayStr]
  );
  const sandboxHistoricalData = useMemo(
    () => filterBySeasonAndRange(sandboxModelData, { ...rangeOpts, todayStr }),
    [sandboxModelData, selectedSeason, timeRange, customStartMonth, customEndMonth, todayStr]
  );
  const filteredHistoricalData = useMemo(
    () => filterBySeasonAndRange(historicalData, rangeOpts),
    [historicalData, selectedSeason, timeRange, customStartMonth, customEndMonth]
  );

  const historicalStats = useMemo(() => {
    const highRiskDays = filteredHistoricalData.filter((d) => d.threat > JI_HIGH_RISK_THRESHOLD).length;
    const dateSet = new Set(filteredHistoricalData.map((d) => d.fullDate));
    const totalSprays = events.filter((e) => e.type === 'spray' && dateSet.has(e.date)).length;
    const avgThreat = filteredHistoricalData.length
      ? (
          filteredHistoricalData.reduce((acc, curr) => acc + curr.threat, 0) / filteredHistoricalData.length
        ).toFixed(2)
      : '0.00';
    const stageBreakdown = SH_WALNUT_PHENOLOGY_BY_MONTH.map((row) => {
      const stageData = filteredHistoricalData.filter((d) => {
        const date = new Date(`${d.fullDate}T12:00:00Z`);
        return growthStageFromDate(date) === row.stage;
      });
      const avgStageThreat = stageData.length
        ? (stageData.reduce((acc, curr) => acc + curr.threat, 0) / stageData.length).toFixed(2)
        : '0.00';
      const stageDates = new Set(stageData.map((d) => d.fullDate));
      const stageSprays = events.filter((e) => e.type === 'spray' && stageDates.has(e.date)).length;
      const stageHighRiskDays = stageData.filter((d) => d.threat > JI_HIGH_RISK_THRESHOLD).length;
      const chip = BLIGHT_STAGE_CHIP[row.stage];
      return {
        name: `${growthStageLabel(row.stage)} (${row.monthLabels})`,
        stage: row.stage,
        color: chip.color,
        textColor: chip.textColor,
        avgThreat: avgStageThreat,
        sprays: stageSprays,
        highRiskDays: stageHighRiskDays,
        count: stageData.length,
      };
    });
    return { highRiskDays, totalSprays, avgThreat, stageBreakdown };
  }, [filteredHistoricalData, events]);

  const comparisonData = useMemo(() => {
    if (!compareWithPrevious || filteredHistoricalData.length === 0) return [];
    return filteredHistoricalData.map((d) => {
      const date = new Date(d.timestamp);
      date.setFullYear(date.getFullYear() - 1);
      const prevPoint = allData.find((p) => {
        const pDate = new Date(p.timestamp);
        return pDate.getUTCMonth() === date.getUTCMonth() && pDate.getUTCDate() === date.getUTCDate();
      });
      return {
        dateStr: d.dateStr,
        prevThreat: prevPoint?.threat || 0,
        prevChem: prevPoint?.chem || 0,
        prevBio: prevPoint?.bio || 0,
      };
    });
  }, [filteredHistoricalData, allData, compareWithPrevious]);

  const symptomOnsetByDate = useMemo(
    () => computeSymptomOnsetSeries(historicalData),
    [historicalData]
  );

  const chartData = useMemo(() => {
    const base = filteredHistoricalData.map((d) => ({
      ...d,
      symptomOnset: symptomOnsetByDate.get(d.fullDate) ?? 0,
    }));
    if (!compareWithPrevious) return base;
    return base.map((d, i) => ({
      ...d,
      prevThreat: comparisonData[i]?.prevThreat,
      prevChem: comparisonData[i]?.prevChem,
      prevBio: comparisonData[i]?.prevBio,
    }));
  }, [filteredHistoricalData, comparisonData, compareWithPrevious, symptomOnsetByDate]);

  const forecastSorted = useMemo(
    () => [...forecastData].sort((a, b) => a.timestamp - b.timestamp),
    [forecastData]
  );
  const currentRisk = forecastSorted[0]?.threat || 0;
  const todayBand = bandFromRisk(currentRisk);
  const sevenDayOutlook = useMemo(() => summarizeNext7Days(forecastSorted), [forecastSorted]);

  const recentInfectionEvents = useMemo(() => {
    const cutoff = new Date(todayDate);
    cutoff.setDate(cutoff.getDate() - 21);
    const cutKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
    const window = allData.filter((d) => d.fullDate >= cutKey && d.fullDate <= todayStr);
    return detectInfectionEvents(window);
  }, [allData, todayDate, todayStr]);
  const latestEvent = recentInfectionEvents[recentInfectionEvents.length - 1] ?? null;
  const currentWeather = forecastSorted[0] || { T: 0, RH: 0, R: 0, WD: 0 };

  return {
    allData,
    historicalData,
    lastObservedDateStr,
    hasRealForecast,
    lastForecastDateStr,
    forecastHorizonEndStr,
    forecastData,
    sandboxScenariosData,
    sandboxModelData,
    sandboxHistoricalStats,
    sandboxForecastData,
    sandboxHistoricalData,
    filteredHistoricalData,
    historicalStats,
    comparisonData,
    chartData,
    forecastSorted,
    currentRisk,
    todayBand,
    sevenDayOutlook,
    recentInfectionEvents,
    latestEvent,
    currentWeather,
  };
}
