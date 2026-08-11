import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ComposedChart, Line, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { useUsageTracking } from '../hooks/useUsageTracking';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, AlertTriangle, RefreshCw, Settings2, Calendar, Droplets, ThermometerSun, History, LineChart as LineChartIcon, X, CloudRain, BookOpen, FileDown, ChevronDown, ChevronUp, Info, Bug, Sparkles, ChevronRight, ShieldCheck } from 'lucide-react';
import { cn } from '../lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { OperationType, handleFirestoreError } from '../contexts/AuthContext';
import { BlightOrchardInoculumPanel } from '../components/blight/BlightOrchardInoculumPanel';
import { BlightResearchModifiersPanel } from '../components/blight/BlightResearchModifiersPanel';
import type { OrchardInoculumLevel } from '../lib/modelParameters';
import {
  runBlightModel,
  resolveCanopyGeometry,
  growthStageFromDate,
  growthStageLabel,
  calendarMonthLabelsForStage,
  SH_WALNUT_PHENOLOGY_BY_MONTH,
  SprayType,
  ApplicationMethod,
  WeatherData,
  GrowthStage,
  CalibrationParams,
  defaultCalibration,
} from '../lib/blightModel';
import { runJiBlightSeries } from '../lib/runJiBlightSeries';
import { kFromInoculumLevel } from '../../shared/weather/jiBlightModel';
import {
  JI_ACTION_THRESHOLD,
  JI_HIGH_RISK_THRESHOLD,
  JI_WATCH_THRESHOLD,
  RISK_BAND_LABEL,
  bandFromRisk,
  detectInfectionEvents,
  eventSeverityPhrase,
  summarizeNext7Days,
  computeSymptomOnsetSeries,
  symptomWindowForEvent,
  INCUBATION_MIN_DAYS,
  INCUBATION_MAX_DAYS,
} from '../lib/jiBlightBands';
import { fetchEnvironmentalData, WeatherSource, fetchAllDPIRDStations, calculateDistance } from '../lib/weatherService';
import { useFarmDiary } from '../lib/farmDiary';
import { useMapStore } from '../lib/mapStore';
import { WALNUT_DISTRICTS, SEASONS } from '../constants';
import { SandboxMatrix } from '../components/SandboxMatrix';

const seasonMonthsList = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const availableSeasons = SEASONS;

const BLIGHT_STAGE_CHIP: Record<GrowthStage, { color: string; textColor: string }> = {
  dormant: { color: 'bg-slate-200', textColor: 'text-slate-600' },
  bud_break: { color: 'bg-lime-200', textColor: 'text-lime-800' },
  bloom: { color: 'bg-emerald-200', textColor: 'text-emerald-700' },
  post_bloom: { color: 'bg-blue-200', textColor: 'text-blue-700' },
  shell_hardening: { color: 'bg-amber-200', textColor: 'text-amber-700' },
};

function getCurrentSeasonStr(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  // Season starts in July (month 6)
  if (month >= 6) {
    return `${year}-${(year + 1).toString().slice(-2)}`;
  } else {
    return `${year - 1}-${year.toString().slice(-2)}`;
  }
}

/**
 * How many days past the last observation to project the persistence "forecast".
 * DPIRD provides observations only, so beyond the last obs the chart just carries
 * the last known weather forward — we cap that to a short, honest window.
 */
const FORECAST_HORIZON_DAYS = 7;

/** Ji daily risk is often << 0.01; plain toFixed(2) collapses everything to 0.00. */
function formatRiskValue(v: number): string {
  if (v === 0) return '0';
  if (Math.abs(v) < 0.001) return v.toExponential(1);
  if (Math.abs(v) < 1) return v.toFixed(3);
  return v.toFixed(2);
}

/** Recharts default tooltip shows the raw X timestamp (13-digit ms). Format as a date + weather. */
function BlightChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; stroke?: string; fill?: string; dataKey?: string; payload?: Record<string, unknown> }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload as
    | { T?: number; WD?: number; R?: number; RH?: number; dateStr?: string; fullDate?: string; isPersistence?: boolean; isForecast?: boolean }
    | undefined;

  const dateLabel =
    typeof label === 'number' && Number.isFinite(label)
      ? new Date(label).toLocaleDateString('en-AU', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : row?.fullDate || row?.dateStr || String(label ?? '');

  return (
    <div className="rounded-lg bg-white px-3 py-2.5 shadow-md border border-slate-100 text-xs min-w-[180px]">
      <p className="font-semibold text-slate-900 mb-1">
        {dateLabel}
        {row?.isForecast && (
          <span className="ml-2 text-[10px] font-medium text-sky-500">forecast</span>
        )}
        {row?.isPersistence && (
          <span className="ml-2 text-[10px] font-medium text-slate-400">persistence</span>
        )}
      </p>
      {row && (row.T != null || row.WD != null) && (
        <p className="text-slate-500 mb-2 leading-snug">
          {[
            row.T != null ? `${row.T}°C` : null,
            row.WD != null ? `${row.WD} h wet` : null,
            row.R != null ? `${row.R} mm rain` : null,
            row.RH != null ? `${row.RH}% RH` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={String(entry.dataKey ?? entry.name)} className="flex items-center justify-between gap-4">
            <span style={{ color: entry.color || entry.stroke || entry.fill }} className="font-medium">
              {entry.name}
            </span>
            <span className="font-semibold text-slate-800 tabular-nums">
              {typeof entry.value === 'number' ? formatRiskValue(entry.value) : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BlightRisk() {
  // Time context
  const todayDate = new Date();
  const year = todayDate.getFullYear();
  const month = String(todayDate.getMonth() + 1).padStart(2, '0');
  const day = String(todayDate.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  const { userData, isAdmin } = useAuth();
  const farmId = userData?.farmId;
  const { checkLimit, recordUsage, loading: usageLoading } = useUsageTracking();
  const { events, getSprayEvents, getIrrigationEvents, settings } = useFarmDiary();
  const { blocks, viewport } = useMapStore();
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'forecast' | 'historical' | 'sandbox'>('forecast');
  const chartRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  
  // DPIRD Stations State
  const [dpirdStations, setDpirdStations] = useState<any[]>([]);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [isFetchingStations, setIsFetchingStations] = useState(false);
  
  // Sandbox State
  type SandboxScenario = {
    id: string;
    name: string;
    sprays: Record<string, { type: SprayType; method: ApplicationMethod }>;
    irrigation: Record<string, number>;
    treeHeight: number | null;
    canopyWidth: number | null;
    rowSpacing: number | null;
    color: string;
  };

  const [sandboxView, setSandboxView] = useState<'forecast' | 'historical'>('forecast');
  /** Experimental GDD latency + secondary eruption — sandbox only; off by default. */
  const [sandboxUseSecondaryLatency, setSandboxUseSecondaryLatency] = useState(false);
  const [scenarios, setScenarios] = useState<SandboxScenario[]>([
    { id: '1', name: 'Scenario 1', sprays: {}, irrigation: {}, treeHeight: null, canopyWidth: null, rowSpacing: null, color: '#6366f1' },
    { id: '2', name: 'Scenario 2', sprays: {}, irrigation: {}, treeHeight: null, canopyWidth: null, rowSpacing: null, color: '#10b981' },
  ]);
  const [activeScenarioId, setActiveScenarioId] = useState('1');
  const [compareAllScenarios, setCompareAllScenarios] = useState(false);

  const activeScenario = useMemo(() => 
    scenarios.find(s => s.id === activeScenarioId) || scenarios[0],
  [scenarios, activeScenarioId]);

  const setSandboxSprays = (newSprays: Record<string, { type: SprayType; method: ApplicationMethod }>) => {
    setScenarios(prev => prev.map(s => s.id === activeScenarioId ? { ...s, sprays: newSprays } : s));
  };

  const setSandboxIrrigation = (newIrrigation: Record<string, number>) => {
    setScenarios(prev => prev.map(s => s.id === activeScenarioId ? { ...s, irrigation: newIrrigation } : s));
  };

  const setSandboxHeight = (newHeight: number | null) => {
    setScenarios(prev => prev.map(s => s.id === activeScenarioId ? { ...s, treeHeight: newHeight } : s));
  };

  const setSandboxWidth = (newWidth: number | null) => {
    setScenarios(prev => prev.map(s => s.id === activeScenarioId ? { ...s, canopyWidth: newWidth } : s));
  };

  const setSandboxSpacing = (newSpacing: number | null) => {
    setScenarios(prev => prev.map(s => s.id === activeScenarioId ? { ...s, rowSpacing: newSpacing } : s));
  };

  const handleCloneScenario = (sourceId: string) => {
    const source = scenarios.find(s => s.id === sourceId);
    if (!source) return;
    
    const targetId = activeScenarioId;
    setScenarios(prev => prev.map(s => s.id === targetId ? { 
      ...s, 
      sprays: { ...source.sprays }, 
      irrigation: { ...source.irrigation },
      treeHeight: source.treeHeight,
      canopyWidth: source.canopyWidth,
      rowSpacing: source.rowSpacing
    } : s));
  };

  const handleAutoDistribute = (type: SprayType = 'chem') => {
    if (!activeScenario) return;
    
    const isHistorical = sandboxView === 'historical';
    
    // 1. Setup simulation parameters (matching allData logic)
    let startYear;
    let endDate;
    if (isHistorical) {
      startYear = parseInt(selectedSeason.split('-')[0]);
      endDate = new Date(`${startYear + 1}-06-30T23:59:59Z`); 
      if (endDate.getTime() > todayDate.getTime()) {
        endDate = new Date(todayDate);
      }
    } else {
      startYear = parseInt(availableSeasons[0].split('-')[0]);
      endDate = new Date(todayDate);
      endDate.setDate(endDate.getDate() + 30);
    }
    
    const startDate = new Date(`${startYear}-06-01T12:00:00Z`);

    const selectedBlock = selectedBlockId ? blocks.find((b) => b.id === selectedBlockId) : null;
    const canopy = resolveCanopyGeometry({
      selectedBlock,
      blocks,
      overrides: {
        treeHeight: activeScenario.treeHeight,
        canopyWidth: activeScenario.canopyWidth,
        rowSpacing: activeScenario.rowSpacing,
      },
      fallback: {
        treeHeight: debouncedParams.calib.treeHeight,
        canopyWidth: debouncedParams.calib.canopyWidth,
        rowSpacing: debouncedParams.calib.rowSpacing,
      },
    });

    const canopyCoverage = Math.min(1, canopy.canopyWidth / canopy.rowSpacing);
    const avgKc = 0.2 + (0.8 * canopyCoverage);

    const dynamicCalib = {
      ...debouncedParams.calib,
      treeHeight: canopy.treeHeight,
      canopyWidth: canopy.canopyWidth,
      rowSpacing: canopy.rowSpacing,
      cropCoefficient: avgKc
    };

    // 2. Greedy distribution algorithm
    let currentSprays = { ...activeScenario.sprays };
    let iterations = 0;
    const maxIterations = isHistorical ? 100 : 30; // Allow up to one spray per day in the forecast period
    const threshold = 0.8;

    while (iterations < maxIterations) {
      const results = runBlightModel(
        startDate,
        endDate,
        debouncedParams.growthStage,
        currentSprays,
        weatherData,
        irrigationEvents,
        settings.irrigationSystemType,
        dynamicCalib,
        { includeProtection: true, useCanopyMicroclimate: canopy.useCanopyMicroclimate }
      );

      // Find first breach in the relevant period
      const firstBreach = results.find(d => (isHistorical ? d.timestamp >= startDate.getTime() : d.fullDate >= todayStr) && d.threat > threshold);
      
      if (!firstBreach) break;

      // Try to schedule spray before the breach (up to 4 days prior)
      const breachDate = new Date(firstBreach.timestamp);
      let foundSlot = false;
      
      for (let dOffset = 1; dOffset <= 4; dOffset++) {
        const sprayDate = new Date(breachDate);
        sprayDate.setDate(breachDate.getDate() - dOffset);
        
        const year = sprayDate.getFullYear();
        const month = String(sprayDate.getMonth() + 1).padStart(2, '0');
        const day = String(sprayDate.getDate()).padStart(2, '0');
        let sprayDateStr = `${year}-${month}-${day}`;

        // For forecast, don't schedule in the past
        if (!isHistorical && sprayDateStr < todayStr) {
          sprayDateStr = todayStr;
        }
        
        // For historical, don't schedule before start date
        const startYear = startDate.getFullYear();
        const startMonth = String(startDate.getMonth() + 1).padStart(2, '0');
        const startDay = String(startDate.getDate()).padStart(2, '0');
        const startDateStr = `${startYear}-${startMonth}-${startDay}`;

        if (isHistorical && sprayDateStr < startDateStr) {
          sprayDateStr = startDateStr;
        }

        if (!currentSprays[sprayDateStr]) {
          currentSprays[sprayDateStr] = { type, method: 'ground' };
          foundSlot = true;
          break;
        }
        
        // If we adjusted to today/start date and it's already filled, we can't go further back
        if (sprayDateStr <= (isHistorical ? startDateStr : todayStr)) {
          break;
        }
      }
      
      if (!foundSlot) break; // Could not find an available slot to fix this breach

      iterations++;
    }

    setSandboxSprays(currentSprays);
  };

  // Historical Filters
  const [selectedSeason, setSelectedSeason] = useState(getCurrentSeasonStr(todayDate));
  const [timeRange, setTimeRange] = useState<'1M' | '3M' | '6M' | '1Y' | 'Custom'>('1Y');
  const [customStartMonth, setCustomStartMonth] = useState(0);
  const [customEndMonth, setCustomEndMonth] = useState(11);
  const [compareWithPrevious, setCompareWithPrevious] = useState(false);
  
  // Model Parameters
  const [calculating, setCalculating] = useState(false);
  const [isDebouncing, setIsDebouncing] = useState(false);
  const [lastCalculated, setLastCalculated] = useState<Date | null>(new Date());
  /** Sandbox fixed-stage what-if (ignored on Forecast/Historical calendar path). */
  const [growthStage, setGrowthStage] = useState<GrowthStage>(growthStageFromDate(todayDate));
  /**
   * Optional scouted stage for Forecast days from today onward.
   * `null` = calendar schedule only. Not persisted yet (diary hook later).
   */
  const [scoutingStage, setScoutingStage] = useState<GrowthStage | null>(null);

  // Developer Calibration
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [calib, setCalib] = useState<CalibrationParams>(defaultCalibration);
  const [loadingParams, setLoadingParams] = useState(true);

  // Debounced params for the model
  const [debouncedParams, setDebouncedParams] = useState({
    growthStage,
    calib
  });

  useEffect(() => {
    setIsDebouncing(true);
    const timer = setTimeout(() => {
      setDebouncedParams({
        growthStage,
        calib
      });
      setIsDebouncing(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [growthStage, calib]);

  // Fetch Model Parameters from Firestore
  useEffect(() => {
    if (!farmId) {
      setLoadingParams(false);
      return;
    }

    const docRef = doc(db, 'farms', farmId, 'settings', 'model_params');
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const firestoreParams = docSnap.data();
        setCalib(prev => ({
          ...prev,
          ...firestoreParams
        }));
      }
      setLoadingParams(false);
    }, (error) => {
      setLoadingParams(false);
      try {
        handleFirestoreError(error, OperationType.GET, `farms/${farmId}/settings/model_params`);
      } catch (e) {
        // Error is already logged by handleFirestoreError
      }
    });

    return () => unsubscribe();
  }, [farmId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setShowDevPanel(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Spray Events from Diary
  const sprayEvents = useMemo(() => getSprayEvents(selectedBlockId || undefined), [getSprayEvents, selectedBlockId]);
  const irrigationEvents = useMemo(() => getIrrigationEvents(selectedBlockId || undefined), [getIrrigationEvents, selectedBlockId]);

  // Weather Data State
  const [weatherSource, setWeatherSource] = useState<WeatherSource>('DPIRD');
  const [locationId, setLocationId] = useState('manjimup');
  const [weatherData, setWeatherData] = useState<Record<string, WeatherData>>({});
  const [forecastWeather, setForecastWeather] = useState<Record<string, WeatherData>>({});
  const [forecastUpdatedAt, setForecastUpdatedAt] = useState<string | undefined>(undefined);
  const [weatherMeta, setWeatherMeta] = useState<{ lastUpdated?: string; isStale?: boolean; cacheSource?: string } | null>(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState(true);

  // Fetch DPIRD Stations and User Location
  useEffect(() => {
    let isMounted = true;
    
    const initLocations = async () => {
      setIsFetchingStations(true);
      
      // 1. Get User Location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (isMounted) {
              setUserLocation({
                lat: position.coords.latitude,
                lng: position.coords.longitude
              });
            }
          },
          (error) => {
            console.warn("Geolocation access denied or failed:", error);
          }
        );
      }

      // 2. Fetch DPIRD Stations
      try {
        const stations = await fetchAllDPIRDStations();
        if (isMounted && stations.length > 0) {
          setDpirdStations(stations);
        }
      } catch (error) {
        console.error("Failed to fetch DPIRD stations:", error);
      } finally {
        if (isMounted) {
          setIsFetchingStations(false);
        }
      }
    };

    initLocations();
    
    return () => { isMounted = false; };
  }, []);

  const processedStations = useMemo(() => {
    if (!dpirdStations || dpirdStations.length === 0) return [];

    const farmLat = viewport.lat;
    const farmLng = viewport.lng;

    const stationsWithDistances = dpirdStations.map(station => {
      const distToFarm = calculateDistance(farmLat, farmLng, station.latitude, station.longitude);
      const distToUser = userLocation ? calculateDistance(userLocation.lat, userLocation.lng, station.latitude, station.longitude) : Infinity;
      return {
        ...station,
        distToFarm,
        distToUser
      };
    });

    // Filter stations within 50km of farm OR user
    const filteredStations = stationsWithDistances.filter(s => s.distToFarm <= 50 || s.distToUser <= 50);

    // If no stations within 50km, just return the closest one to the farm
    if (filteredStations.length === 0) {
      const closestToFarm = [...stationsWithDistances].sort((a, b) => a.distToFarm - b.distToFarm)[0];
      return closestToFarm ? [closestToFarm] : [];
    }

    // Sort: Closest to farm first, then the rest sorted by distance to user
    const minFarmDist = Math.min(...filteredStations.map(s => s.distToFarm));
    
    const sortedStations = [...filteredStations].sort((a, b) => {
      // If one is the absolute closest to the farm, it goes first
      if (a.distToFarm === minFarmDist && b.distToFarm !== minFarmDist) return -1;
      if (b.distToFarm === minFarmDist && a.distToFarm !== minFarmDist) return 1;
      
      // Otherwise sort by distance to user
      return a.distToUser - b.distToUser;
    });

    return sortedStations;
  }, [dpirdStations, viewport, userLocation]);

  // Set default locationId when stations are loaded or source changes
  useEffect(() => {
    if (weatherSource === 'DPIRD') {
      if (processedStations.length > 0) {
        const bestStation = processedStations[0].stationCode || processedStations[0].code;
        if (locationId === 'manjimup' || !processedStations.find(s => (s.stationCode || s.code) === locationId)) {
          setLocationId(bestStation);
        }
      }
    } else {
      // If switching to Manual and current location is a DPIRD station, reset to manjimup
      if (!WALNUT_DISTRICTS.find(d => d.id === locationId)) {
        setLocationId('manjimup');
      }
    }
  }, [processedStations, weatherSource, locationId]);

  // Fetch Weather Data
  useEffect(() => {
    if (!farmId) return;
    // DPIRD station list still loading — wait before fetching (avoids empty station race)
    if (weatherSource === 'DPIRD' && isFetchingStations) return;

    let isMounted = true;
    const loadWeather = async () => {
      setIsLoadingWeather(true);
      try {
        // Forecast needs current season; historical/sandbox need deeper history.
        // (Server now paginates DPIRD's 100-day pages — still keep the window tight when we can.)
        const seasonKey =
          activeTab === 'forecast'
            ? availableSeasons[0]
            : availableSeasons[availableSeasons.length - 1];
        const startYear = parseInt(seasonKey.split('-')[0], 10);
        const startDate = new Date(`${startYear}-06-01T12:00:00Z`); // June before July season start

        const endDate = new Date(todayDate);
        endDate.setDate(endDate.getDate() + 30);
        
        let lat = -34.24;
        let lng = 116.14;
        let actualStationCode: string | undefined = undefined;

        if (weatherSource === 'DPIRD') {
          const station = processedStations.find(s => (s.stationCode || s.code) === locationId);
          if (station) {
            lat = station.latitude;
            lng = station.longitude;
            actualStationCode = station.stationCode || station.code;
          } else if (processedStations.length > 0) {
            lat = processedStations[0].latitude;
            lng = processedStations[0].longitude;
            actualStationCode = processedStations[0].stationCode || processedStations[0].code;
          }
        } else {
          const district = WALNUT_DISTRICTS.find(d => d.id === locationId);
          if (district) {
            lat = district.lat;
            lng = district.lng;
          }
        }

        // fetchEnvironmentalData returns { weatherData, lastUpdated, … }
        // (fetchWeatherData only returns the map — do not use .weatherData on it)
        const result = await fetchEnvironmentalData(
          farmId || '',
          weatherSource,
          startDate,
          endDate,
          lat,
          lng,
          actualStationCode
        );

        if (isMounted) {
          const keys = Object.keys(result.weatherData || {});
          if (keys.length === 0 && weatherSource === 'DPIRD') {
            console.warn('[Blight] DPIRD weather empty; switching to Manual / Fallback');
            setWeatherSource('Manual');
            return;
          }
          setWeatherData(result.weatherData);
          setForecastWeather(result.forecastData || {});
          setForecastUpdatedAt(result.forecastUpdatedAt);
          setWeatherMeta({
            lastUpdated: result.lastUpdated,
            isStale: result.isStale,
            cacheSource: result.cacheSource,
          });
          if (result.cacheSource) {
            console.log(
              `[Blight] Weather loaded: ${keys.length} days via ${result.cacheSource}` +
                (result.isStale ? ' (stale)' : '')
            );
          }
        }
      } catch (error) {
        console.error("Failed to fetch weather data:", error);
        if (isMounted && weatherSource === 'DPIRD') {
          setWeatherSource('Manual');
          return;
        }
      } finally {
        if (isMounted) {
          setIsLoadingWeather(false);
        }
      }
    };

    loadWeather();
    return () => { isMounted = false; };
  }, [
    weatherSource,
    locationId,
    processedStations,
    farmId,
    availableSeasons,
    isFetchingStations,
    activeTab,
  ]);

  // Don't leave the chart behind a permanent "Initializing…" veil
  useEffect(() => {
    if (!loadingParams) return;
    const t = setTimeout(() => setLoadingParams(false), 4000);
    return () => clearTimeout(t);
  }, [loadingParams]);

  /**
   * Observed weather + MET Norway forecast (future days only, observed always
   * wins). Feeds the Ji production path so forecast days score on the same model
   * as history; days beyond the forecast window still fall back to persistence
   * inside runJiBlightSeries.
   */
  const modelWeather = useMemo(() => {
    const observed = weatherData || {};
    const fKeys = Object.keys(forecastWeather);
    if (fKeys.length === 0) return observed;
    const observedKeys = Object.keys(observed).sort();
    const maxObserved = observedKeys.length ? observedKeys[observedKeys.length - 1] : '';
    const merged: Record<string, WeatherData> = { ...observed };
    for (const k of fKeys) {
      if (k > maxObserved && !observed[k]) merged[k] = forecastWeather[k];
    }
    return merged;
  }, [weatherData, forecastWeather]);

  // Run the mathematical model
  const allData = useMemo(() => {
    if (!weatherData || Object.keys(weatherData).length === 0) return [];
    
    // Optimization: If we are in forecast tab, we don't need the full multi-year history
    // We only need enough history to have a stable starting point for today.
    // Starting from the beginning of the current season (July) is a good balance.
    let startYear;
    if (activeTab === 'forecast' || (activeTab === 'sandbox' && sandboxView === 'forecast')) {
      // Use the start year of the most recent season
      startYear = parseInt(availableSeasons[0].split('-')[0]);
    } else {
      // Run from the earliest possible date in weatherData for full history
      const earliestSeason = availableSeasons[availableSeasons.length - 1];
      startYear = parseInt(earliestSeason.split('-')[0]);
    }
    
    const startDate = new Date(`${startYear}-06-01T12:00:00Z`);
    const endDate = new Date(todayDate);
    endDate.setDate(endDate.getDate() + 30);

    // Production tabs: Ji et al. 2025. Sandbox baseline must match legacy scenario scale.
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
        settings.irrigationSystemType,
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
      // Orchard primary inoculum from prior-season blight / bud CFU (H/M/L → k).
      orchard: { k: kFromInoculumLevel(debouncedParams.calib.orchardInoculumLevel) },
      // cumulativeY within each SH budbreak season — deltaY went flat after Y≈1
      doseMode: 'cumulativeY',
    });
  }, [
    weatherData,
    modelWeather,
    activeTab,
    sandboxView,
    todayDate,
    availableSeasons,
    selectedBlockId,
    blocks,
    debouncedParams,
    irrigationEvents,
    settings.irrigationSystemType,
  ]);

  // Split data into historical and forecast
  const historicalData = useMemo(() => allData.filter(d => d.fullDate <= todayStr), [allData, todayStr]);

  /**
   * Last calendar day we actually have observed (DPIRD) weather for (≤ today).
   * Days after this come from the MET Norway forecast where available, then fall
   * back to persistence (last obs carried forward) beyond the forecast horizon.
   */
  const lastObservedDateStr = useMemo(() => {
    const observedKeys = Object.keys(weatherData).filter((k) => k <= todayStr);
    return observedKeys.length ? observedKeys.sort()[observedKeys.length - 1] : todayStr;
  }, [weatherData, todayStr]);

  /** Future days covered by a real MET Norway forecast (after the last obs). */
  const forecastKeys = useMemo(
    () => Object.keys(forecastWeather).filter((k) => k > lastObservedDateStr).sort(),
    [forecastWeather, lastObservedDateStr]
  );
  const hasRealForecast = forecastKeys.length > 0;
  const lastForecastDateStr = hasRealForecast ? forecastKeys[forecastKeys.length - 1] : undefined;

  /**
   * Chart window end: the real forecast horizon when we have one, otherwise the
   * short persistence tail.
   */
  const forecastHorizonEndStr = useMemo(() => {
    if (lastForecastDateStr) return lastForecastDateStr;
    const d = new Date(`${lastObservedDateStr}T12:00:00`);
    d.setDate(d.getDate() + FORECAST_HORIZON_DAYS);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, [lastObservedDateStr, lastForecastDateStr]);

  const forecastData = useMemo(
    () =>
      allData
        .filter((d) => d.fullDate >= todayStr && d.fullDate <= forecastHorizonEndStr)
        .map((d) => {
          const isForecast = d.fullDate > lastObservedDateStr && !!forecastWeather[d.fullDate];
          return {
            ...d,
            isForecast,
            isPersistence: d.fullDate > lastObservedDateStr && !isForecast,
          };
        }),
    [allData, todayStr, forecastHorizonEndStr, lastObservedDateStr, forecastWeather]
  );

  // Run the sandbox mathematical model for each scenario
  const sandboxScenariosData = useMemo(() => {
    if (activeTab !== 'sandbox' || !weatherData || Object.keys(weatherData).length === 0) return {};
    
    let startYear;
    if (sandboxView === 'forecast') {
      startYear = parseInt(availableSeasons[0].split('-')[0]);
    } else {
      const earliestSeason = availableSeasons[availableSeasons.length - 1];
      startYear = parseInt(earliestSeason.split('-')[0]);
    }
    
    const startDate = new Date(`${startYear}-06-01T12:00:00Z`);
    const endDate = new Date(todayDate);
    endDate.setDate(endDate.getDate() + 30);
    
    const results: Record<string, any[]> = {};

    scenarios.forEach(scenario => {
      // Only calculate for active scenario OR all if compareAllScenarios is true
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
      const scenarioKc = 0.2 + (0.8 * scenarioCoverage);

      const dynamicCalib = {
        ...debouncedParams.calib,
        treeHeight: canopy.treeHeight,
        canopyWidth: canopy.canopyWidth,
        rowSpacing: canopy.rowSpacing,
        cropCoefficient: scenarioKc
      };

      const combinedSprays = { ...sprayEvents, ...scenario.sprays };
      const combinedIrrigation = { ...irrigationEvents, ...scenario.irrigation };

      results[scenario.id] = runBlightModel(
        startDate, 
        endDate, 
        debouncedParams.growthStage, 
        combinedSprays, 
        weatherData, 
        combinedIrrigation,
        settings.irrigationSystemType,
        dynamicCalib,
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
    settings.irrigationSystemType,
    sandboxUseSecondaryLatency,
    weatherData,
    activeTab,
    blocks,
    selectedBlockId,
    scenarios,
    activeScenarioId,
    compareAllScenarios,
    sandboxView,
  ]);

  const sandboxModelData = useMemo(() => sandboxScenariosData[activeScenarioId] || [], [sandboxScenariosData, activeScenarioId]);

  const sandboxHistoricalStats = useMemo(() => {
    const results: Record<string, any> = {};
    
    Object.entries(sandboxScenariosData).forEach(([id, data]) => {
      // Filter data for the selected season/range
      const [startYearStr, endYearSuffixStr] = selectedSeason.split('-');
      const startYear = parseInt(startYearStr);
      const fullEndYear = 2000 + parseInt(endYearSuffixStr);
      const seasonStart = new Date(`${startYear}-07-01T00:00:00Z`).getTime();
      const seasonEnd = new Date(`${fullEndYear}-06-30T23:59:59Z`).getTime();

      const scenarioData = data as any[];
      let seasonData = scenarioData.filter(d => d.timestamp >= seasonStart && d.timestamp <= seasonEnd && d.fullDate <= todayStr);
      
      if (timeRange === 'Custom') {
        const seasonMonthMap = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5];
        const allowedMonths = seasonMonthMap.slice(customStartMonth, customEndMonth + 1);
        seasonData = seasonData.filter(d => {
          const month = new Date(d.timestamp).getUTCMonth();
          return allowedMonths.includes(month);
        });
      } else if (timeRange !== '1Y') {
        let daysToSubtract = 365;
        if (timeRange === '1M') daysToSubtract = 30;
        if (timeRange === '3M') daysToSubtract = 90;
        if (timeRange === '6M') daysToSubtract = 180;
        seasonData = seasonData.slice(-daysToSubtract);
      }

      const highRiskDays = seasonData.filter((d) => d.threat > JI_HIGH_RISK_THRESHOLD).length;
      const totalSprays = seasonData.filter(d => d.isSprayDay).length;
      const avgThreat = seasonData.length 
        ? (seasonData.reduce((acc, curr) => acc + curr.threat, 0) / seasonData.length).toFixed(2)
        : '0.00';

      results[id] = { highRiskDays, totalSprays, avgThreat };
    });
    
    return results;
  }, [sandboxScenariosData, selectedSeason, timeRange, customStartMonth, customEndMonth]);

  const sandboxForecastData = useMemo(() => sandboxModelData.filter(d => d.fullDate >= todayStr), [sandboxModelData, todayStr]);

  const sandboxHistoricalData = useMemo(() => {
    const [startYearStr, endYearSuffixStr] = selectedSeason.split('-');
    const startYear = parseInt(startYearStr);
    const fullEndYear = 2000 + parseInt(endYearSuffixStr);

    // Define season boundaries (July 1st to June 30th)
    const seasonStart = new Date(`${startYear}-07-01T00:00:00Z`).getTime();
    const seasonEnd = new Date(`${fullEndYear}-06-30T23:59:59Z`).getTime();

    let seasonData = sandboxModelData.filter(d => d.timestamp >= seasonStart && d.timestamp <= seasonEnd && d.fullDate <= todayStr);
    
    if (seasonData.length === 0) return [];

    if (timeRange === 'Custom') {
      const seasonMonthMap = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5];
      const allowedMonths = seasonMonthMap.slice(customStartMonth, customEndMonth + 1);
      return seasonData.filter(d => {
        const month = new Date(d.timestamp).getUTCMonth();
        return allowedMonths.includes(month);
      });
    }

    if (timeRange === '1Y') return seasonData;

    let daysToSubtract = 365;
    if (timeRange === '1M') daysToSubtract = 30;
    if (timeRange === '3M') daysToSubtract = 90;
    if (timeRange === '6M') daysToSubtract = 180;
    
    return seasonData.slice(-daysToSubtract);
  }, [sandboxModelData, selectedSeason, timeRange, customStartMonth, customEndMonth]);

  // Filter historical data based on selected time range and season
  const filteredHistoricalData = useMemo(() => {
    const [startYearStr, endYearSuffixStr] = selectedSeason.split('-');
    const startYear = parseInt(startYearStr);
    const fullEndYear = 2000 + parseInt(endYearSuffixStr);

    // Define season boundaries (July 1st to June 30th)
    const seasonStart = new Date(`${startYear}-07-01T00:00:00Z`).getTime();
    const seasonEnd = new Date(`${fullEndYear}-06-30T23:59:59Z`).getTime();

    let seasonData = historicalData.filter(d => d.timestamp >= seasonStart && d.timestamp <= seasonEnd);
    
    if (seasonData.length === 0) return [];

    if (timeRange === 'Custom') {
      // seasonMonthsList = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
      // customStartMonth and customEndMonth are indices into seasonMonthsList
      const seasonMonthMap = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5];
      const allowedMonths = seasonMonthMap.slice(customStartMonth, customEndMonth + 1);
      
      return seasonData.filter(d => {
        const month = new Date(d.timestamp).getUTCMonth();
        return allowedMonths.includes(month);
      });
    }

    if (timeRange === '1Y') return seasonData;

    let daysToSubtract = 365;
    if (timeRange === '1M') daysToSubtract = 30;
    if (timeRange === '3M') daysToSubtract = 90;
    if (timeRange === '6M') daysToSubtract = 180;
    
    return seasonData.slice(-daysToSubtract);
  }, [historicalData, selectedSeason, timeRange, customStartMonth, customEndMonth]);

  // Calculate summary stats for the historical view
  const historicalStats = useMemo(() => {
    const highRiskDays = filteredHistoricalData.filter((d) => d.threat > JI_HIGH_RISK_THRESHOLD).length;
    const dateSet = new Set(filteredHistoricalData.map(d => d.fullDate));
    const totalSprays = events.filter(e => e.type === 'spray' && dateSet.has(e.date)).length;
    const avgThreat = filteredHistoricalData.length 
      ? (filteredHistoricalData.reduce((acc, curr) => acc + curr.threat, 0) / filteredHistoricalData.length).toFixed(2)
      : '0.00';

    // Breakdown using the same SH calendar the engine uses (not a separate season UI scale).
    const stageBreakdown = SH_WALNUT_PHENOLOGY_BY_MONTH.map((row) => {
      const stageData = filteredHistoricalData.filter((d) => {
        const date = new Date(`${d.fullDate}T12:00:00Z`);
        return growthStageFromDate(date) === row.stage;
      });

      const avgStageThreat = stageData.length
        ? (stageData.reduce((acc, curr) => acc + curr.threat, 0) / stageData.length).toFixed(2)
        : '0.00';
      
      const stageDates = new Set(stageData.map(d => d.fullDate));
      const stageSprays = events.filter(e => e.type === 'spray' && stageDates.has(e.date)).length;
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
        count: stageData.length
      };
    });

    return { highRiskDays, totalSprays, avgThreat, stageBreakdown };
  }, [filteredHistoricalData, events]);

  // Comparison Data (Previous Season)
  const comparisonData = useMemo(() => {
    if (!compareWithPrevious || filteredHistoricalData.length === 0) return [];

    return filteredHistoricalData.map(d => {
      const date = new Date(d.timestamp);
      date.setFullYear(date.getFullYear() - 1);
      const prevTimestamp = date.getTime();
      
      // Find the closest data point in allData
      const prevPoint = allData.find(p => {
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

  /**
   * Ji incubation overlay: when would lesions from earlier infection periods
   * become visible? Computed over the full season series (so the 15–21 day lag can
   * see infection days before the chart window), then looked up per chart day.
   */
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

  // Live Ji model (Dashboard aggregate now runs the same Ji module — BV-09 parity).
  const forecastSorted = useMemo(
    () => [...forecastData].sort((a, b) => a.timestamp - b.timestamp),
    [forecastData]
  );
  const currentRisk = forecastSorted[0]?.threat || 0;
  const todayBand = bandFromRisk(currentRisk);
  const sevenDayOutlook = useMemo(() => summarizeNext7Days(forecastSorted), [forecastSorted]);

  /** Recent infection events (Watch+) in the last 21 days. */
  const recentInfectionEvents = useMemo(() => {
    const cutoff = new Date(todayDate);
    cutoff.setDate(cutoff.getDate() - 21);
    const cutKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
    const window = allData.filter((d) => d.fullDate >= cutKey && d.fullDate <= todayStr);
    return detectInfectionEvents(window);
  }, [allData, todayDate, todayStr]);
  const latestEvent = recentInfectionEvents[recentInfectionEvents.length - 1] ?? null;

  // Derived UI states
  const isOverLimit = !usageLoading && !checkLimit('calculations');
  const currentWeather = forecastSorted[0] || { T: 0, RH: 0, R: 0, WD: 0 };

  // Sort historical sprays (descending) — diary reference, not model efficacy
  const historicalSprays = events
    .filter(e => e.type === 'spray' && e.date < todayStr)
    .sort((a, b) => b.date.localeCompare(a.date));

  const lastSprayDate = historicalSprays[0]?.date || 'N/A';
  const daysSinceLastSpray =
    lastSprayDate !== 'N/A'
      ? Math.floor((todayDate.getTime() - new Date(`${lastSprayDate}T12:00:00`).getTime()) / (1000 * 60 * 60 * 24))
      : null;
  // Diary "recent spray" flag only — not a chemical efficacy claim
  const isProtected = daysSinceLastSpray !== null && daysSinceLastSpray <= 14;

  const handleCalculate = async () => {
    if (!checkLimit('calculations')) return;
    setCalculating(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
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
      const doc = new jsPDF();
      
      // Header
      doc.setFontSize(20);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text('Historical Blight Risk Report', 14, 22);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
      doc.text(`Farm: ${settings.farmName || 'My Farm'}`, 14, 35);
      doc.text(`Season: ${selectedSeason}`, 14, 40);
      doc.text(`Period: ${timeRange === 'Custom' ? `${seasonMonthsList[customStartMonth]} - ${seasonMonthsList[customEndMonth]}` : `Past ${timeRange}`}`, 14, 45);
      
      // Stats Section
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text('Period Summary', 14, 60);
      
      autoTable(doc, {
        startY: 65,
        head: [['Metric', 'Value']],
        body: [
          [`High index days (> ${JI_HIGH_RISK_THRESHOLD})`, historicalStats.highRiskDays.toString()],
          ['Sprays Applied', historicalStats.totalSprays.toString()],
          ['Average Threat Level', historicalStats.avgThreat],
          ['Location', weatherSource === 'DPIRD' ? (processedStations.find(s => (s.stationCode || s.code) === locationId)?.stationName || locationId) : (WALNUT_DISTRICTS.find(d => d.id === locationId)?.name || locationId)]
        ],
        theme: 'striped',
        headStyles: { fillColor: [16, 185, 129] }, // emerald-500
      });

      // Stage-Aware Breakdown Table
      doc.setFontSize(14);
      doc.text('Risk Breakdown by Growth Stage', 14, 125);
      
      autoTable(doc, {
        startY: 130,
        head: [['Stage', 'Avg Risk', 'Sprays', 'Critical Days']],
        body: historicalStats.stageBreakdown.map(s => [
          s.name,
          s.avgThreat,
          s.sprays.toString(),
          s.highRiskDays.toString()
        ]),
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246] }, // blue-500
        styles: { fontSize: 9 }
      });

      // Capture Chart
      const canvas = await html2canvas(chartRef.current, {
        scale: 2,
        logging: false,
        useCORS: true
      });
      const imgData = canvas.toDataURL('image/png');
      
      // Add Chart to PDF
      doc.addPage();
      doc.setFontSize(14);
      doc.text('Risk Trend Visualization', 14, 22);
      doc.addImage(imgData, 'PNG', 14, 30, 180, 90);
      
      // High Risk Events Table (Reduced Summary)
      const highRiskEvents = filteredHistoricalData
        .filter((d) => d.threat > JI_HIGH_RISK_THRESHOLD)
        .map(d => [
          d.dateStr,
          d.threat.toFixed(2),
          d.T.toFixed(1) + '°C',
          d.RH.toFixed(0) + '%',
          d.WD.toFixed(1) + 'h',
          d.isSprayDay ? 'YES' : 'NO'
        ]);

      if (highRiskEvents.length > 0) {
        doc.addPage();
        doc.setFontSize(14);
        doc.text('High Risk Events Summary', 14, 22);
        doc.setFontSize(10);
        doc.text(`Detailed data for days where Ji infection index exceeded ${JI_HIGH_RISK_THRESHOLD}.`, 14, 28);
        
        autoTable(doc, {
          startY: 35,
          head: [['Date', 'Threat', 'Temp', 'RH', 'Wetness', 'Spray']],
          body: highRiskEvents,
          theme: 'grid',
          headStyles: { fillColor: [244, 63, 94] }, // rose-500
          styles: { fontSize: 9 }
        });
      } else {
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text(`No high-index days (Ji risk > ${JI_HIGH_RISK_THRESHOLD}) in this period.`, 14, 220);
      }
      
      doc.save(`Blight_Risk_Report_${selectedSeason}_${timeRange}.pdf`);
    } catch (error) {
      console.error('PDF Export Error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5 pb-24 lg:pb-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Blight risk</h1>
            <p className="text-sm text-slate-500 mt-1">
              Ji et al. 2025 infection risk — spray efficacy is sandbox what-if only.
              {lastCalculated ? ` · Updated ${lastCalculated.toLocaleTimeString()}` : ''}
            </p>
          </div>
          <button 
            onClick={handleCalculate}
            disabled={calculating || isOverLimit}
            className="flex items-center justify-center self-start px-3 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all text-xs font-semibold disabled:opacity-50"
          >
            {calculating ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            )}
            Refresh
          </button>
        </div>

        {/* Block + infrequently changed model inputs */}
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Block</span>
            <select 
              value={selectedBlockId || ''} 
              onChange={(e) => setSelectedBlockId(e.target.value || null)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-400 min-w-[120px]"
            >
              <option value="">All blocks</option>
              {blocks.map(block => (
                <option key={block.id} value={block.id}>{block.name || `Block ${block.id.slice(0,4)}`}</option>
              ))}
            </select>
          </label>

          {activeTab === 'sandbox' ? (
            <label className="flex flex-col gap-0.5 min-w-0">
              <span
                className="text-[9px] font-bold text-slate-400 uppercase tracking-wide"
                title="Locks every sandbox day to this stage (what-if). Forecast/Historical use the SH calendar."
              >
                Growth stage (sandbox)
              </span>
              <select
                value={growthStage}
                onChange={(e) => setGrowthStage(e.target.value as GrowthStage)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-400 min-w-[140px] max-w-[200px]"
              >
                <option value="dormant">Dormant</option>
                <option value="bud_break">Bud break</option>
                <option value="bloom">Bloom</option>
                <option value="post_bloom">Post-bloom</option>
                <option value="shell_hardening">Shell hardening</option>
              </select>
            </label>
          ) : (
            <>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span
                  className="text-[9px] font-bold text-slate-400 uppercase tracking-wide"
                  title="Coarse WA / SH month schedule — not scouting-confirmed"
                >
                  Calendar stage
                </span>
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 min-w-[140px]">
                  {growthStageLabel(growthStageFromDate(todayDate))}
                  <span className="text-slate-400 font-normal">
                    {' '}· {calendarMonthLabelsForStage(growthStageFromDate(todayDate))}
                  </span>
                </div>
              </div>
              <label className="flex flex-col gap-0.5 min-w-0">
                <span
                  className="text-[9px] font-bold text-slate-400 uppercase tracking-wide"
                  title="Optional: from today forward only. Past Historical days stay on the calendar. Not saved yet."
                >
                  Scouted override
                </span>
                <select
                  value={scoutingStage ?? ''}
                  onChange={(e) =>
                    setScoutingStage(e.target.value ? (e.target.value as GrowthStage) : null)
                  }
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-400 min-w-[140px] max-w-[200px]"
                >
                  <option value="">Calendar only</option>
                  <option value="dormant">Dormant</option>
                  <option value="bud_break">Bud break</option>
                  <option value="bloom">Bloom</option>
                  <option value="post_bloom">Post-bloom</option>
                  <option value="shell_hardening">Shell hardening</option>
                </select>
              </label>
            </>
          )}

          <label className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Weather</span>
            <select 
              value={weatherSource}
              onChange={(e) => setWeatherSource(e.target.value as WeatherSource)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-400"
            >
              <option value="DPIRD">DPIRD</option>
              <option value="Manual">Manual</option>
            </select>
          </label>

          <label className="flex flex-col gap-0.5 min-w-0 flex-1 sm:flex-none">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Station</span>
            <select 
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-400 min-w-[140px] max-w-[240px]"
              disabled={weatherSource === 'DPIRD' && isFetchingStations}
            >
              {weatherSource === 'DPIRD' ? (
                isFetchingStations ? (
                  <option value="">Loading…</option>
                ) : processedStations.length > 0 ? (
                  <>
                    <optgroup label="Closest">
                      <option value={processedStations[0].stationCode || processedStations[0].code}>
                        {processedStations[0].stationName} ({Math.round(processedStations[0].distToFarm)}km)
                      </option>
                    </optgroup>
                    {processedStations.length > 1 && (
                      <optgroup label="Nearby">
                        {processedStations.slice(1).map(s => (
                          <option key={s.stationCode || s.code} value={s.stationCode || s.code}>
                            {s.stationName} ({Math.round(s.distToFarm)}km)
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </>
                ) : (
                  <option value="">No stations</option>
                )
              ) : (
                WALNUT_DISTRICTS.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))
              )}
            </select>
          </label>

          {weatherMeta?.lastUpdated && (
            <span className={cn(
              "text-[10px] pb-1.5",
              weatherMeta.isStale ? "text-amber-600" : "text-slate-400"
            )}>
              Cache {new Date(weatherMeta.lastUpdated).toLocaleDateString()}
              {weatherMeta.isStale ? ' · stale' : ''}
            </span>
          )}
        </div>

        <BlightOrchardInoculumPanel
          farmId={farmId}
          level={(calib.orchardInoculumLevel ?? 'medium') as OrchardInoculumLevel}
          canEdit={Boolean(isAdmin && farmId)}
          onLevelChange={(next) => setCalib((prev) => ({ ...prev, orchardInoculumLevel: next }))}
        />
      </div>

      {/* Compact status strip — one row */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-white px-2.5 py-2 rounded-lg border border-slate-200 min-w-0">
          <div className="flex items-center gap-1 text-[9px] font-bold text-slate-500 uppercase tracking-wide truncate">
            <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
            Today
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className={cn(
              "text-lg font-black tracking-tight leading-none",
              todayBand === 'action' ? "text-rose-600" : todayBand === 'watch' ? "text-amber-600" : "text-emerald-600"
            )}>
              {RISK_BAND_LABEL[todayBand]}
            </span>
            <span className="text-[9px] font-medium text-slate-400 truncate tabular-nums">
              {currentRisk.toFixed(3)}
            </span>
          </div>
        </div>

        <div className="bg-white px-2.5 py-2 rounded-lg border border-slate-200 min-w-0">
          <div className="flex items-center gap-1 text-[9px] font-bold text-slate-500 uppercase tracking-wide truncate">
            <CloudRain className="w-3 h-3 text-blue-500 shrink-0" />
            Next rain
          </div>
          <p className="text-lg font-black tracking-tight text-slate-900 leading-none mt-0.5 truncate">
            {forecastData.find(d => d.R > 0.5)?.dateStr.split(',')[1]?.trim() || 'None'}
          </p>
        </div>

        <div className="bg-white px-2.5 py-2 rounded-lg border border-slate-200 min-w-0">
          <div className="flex items-center gap-1 text-[9px] font-bold text-slate-500 uppercase tracking-wide truncate">
            <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />
            Last spray
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5 min-w-0">
            <span className={cn(
              "text-lg font-black tracking-tight leading-none",
              isProtected ? "text-emerald-600" : "text-slate-700"
            )}>
              {lastSprayDate === 'N/A' ? 'None' : (isProtected ? '≤14d' : 'Older')}
            </span>
            <span className="text-[9px] font-medium text-slate-400 truncate">
              {lastSprayDate === 'N/A' ? 'diary only' : `${lastSprayDate} · not modelled`}
            </span>
          </div>
        </div>

        <div className="bg-white px-2.5 py-2 rounded-lg border border-slate-200 min-w-0">
          <div className="flex items-center gap-1 text-[9px] font-bold text-slate-500 uppercase tracking-wide truncate">
            <ThermometerSun className="w-3 h-3 text-amber-500 shrink-0" />
            Weather
          </div>
          <div className={cn(
            "flex items-baseline gap-2 mt-0.5 text-sm font-black text-slate-900 leading-none tabular-nums",
            isLoadingWeather && "opacity-40"
          )}>
            <span>{isLoadingWeather ? '…' : `${currentWeather.T}°`}</span>
            <span className="text-slate-500 font-bold">{isLoadingWeather ? '' : `${currentWeather.RH}%`}</span>
            <span className="text-slate-500 font-bold hidden sm:inline">{isLoadingWeather ? '' : `${currentWeather.R}mm`}</span>
            <span className="text-slate-500 font-bold hidden md:inline">{isLoadingWeather ? '' : `${currentWeather.WD}h`}</span>
          </div>
        </div>
      </div>

      {/* Compact mode switch — graph is the focus */}
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
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            )}
          >
            <tab.icon
              className={cn(
                'w-3.5 h-3.5 shrink-0',
                activeTab === tab.id ? 'text-rose-600' : 'text-slate-400'
              )}
            />
            {tab.title}
          </button>
        ))}
      </div>

      {activeTab === 'forecast' && (
        // ==========================================
        // FORECAST TAB CONTENT
        // ==========================================
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* A1 bands + A2 event + B1 seven-day outlook */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div
              className={cn(
                'rounded-xl border p-4 shadow-sm',
                todayBand === 'action' && 'bg-rose-50 border-rose-200',
                todayBand === 'watch' && 'bg-amber-50 border-amber-200',
                todayBand === 'quiet' && 'bg-emerald-50 border-emerald-200'
              )}
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Today</p>
              <p
                className={cn(
                  'text-2xl font-black tracking-tight',
                  todayBand === 'action' && 'text-rose-700',
                  todayBand === 'watch' && 'text-amber-700',
                  todayBand === 'quiet' && 'text-emerald-700'
                )}
              >
                {RISK_BAND_LABEL[todayBand]}
              </p>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Ji daily index {currentRisk.toFixed(3)}
                <span className="text-slate-400">
                  {' '}
                  · Quiet &lt; {JI_WATCH_THRESHOLD} · Watch · Action ≥ {JI_ACTION_THRESHOLD}
                </span>
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                Latest infection event
              </p>
              {latestEvent ? (
                <>
                  <p
                    className={cn(
                      'text-sm font-bold leading-snug',
                      latestEvent.band === 'action' ? 'text-rose-800' : 'text-amber-800'
                    )}
                  >
                    {eventSeverityPhrase(latestEvent.band)}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    {latestEvent.dayCount === 1
                      ? latestEvent.peakLabel
                      : `${latestEvent.startLabel} – ${latestEvent.endLabel}`}
                    {' · '}
                    peak {latestEvent.peakRisk.toFixed(3)} ({RISK_BAND_LABEL[latestEvent.band]})
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                    Drivers: {latestEvent.R} mm rain · {latestEvent.WD} h wet (proxy) · {latestEvent.T}°C
                  </p>
                  {(() => {
                    const w = symptomWindowForEvent(latestEvent);
                    const fmt = (iso: string) =>
                      new Date(`${iso}T12:00:00`).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                      });
                    return (
                      <p className="text-[11px] text-emerald-700 mt-1.5 leading-relaxed">
                        Scout for symptoms {fmt(w.startDate)} – {fmt(w.endDate)}
                        <span className="text-slate-400"> · Ji {INCUBATION_MIN_DAYS}–{INCUBATION_MAX_DAYS}d incubation</span>
                      </p>
                    );
                  })()}
                </>
              ) : (
                <p className="text-sm text-slate-600 leading-relaxed">
                  No Watch/Action spell in the last 21 days.
                </p>
              )}
            </div>

            <div
              className={cn(
                'rounded-xl border p-4 shadow-sm',
                sevenDayOutlook.outlookBand === 'action' && 'bg-rose-50 border-rose-200',
                sevenDayOutlook.outlookBand === 'watch' && 'bg-amber-50 border-amber-200',
                sevenDayOutlook.outlookBand === 'quiet' && 'bg-white border-slate-200'
              )}
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                Next 7 days
              </p>
              <p
                className={cn(
                  'text-2xl font-black tracking-tight',
                  sevenDayOutlook.outlookBand === 'action' && 'text-rose-700',
                  sevenDayOutlook.outlookBand === 'watch' && 'text-amber-700',
                  sevenDayOutlook.outlookBand === 'quiet' && 'text-slate-800'
                )}
              >
                {RISK_BAND_LABEL[sevenDayOutlook.outlookBand]}
              </p>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                {sevenDayOutlook.actionDays > 0
                  ? `${sevenDayOutlook.actionDays} Action day${sevenDayOutlook.actionDays === 1 ? '' : 's'}${
                      sevenDayOutlook.nextAction
                        ? ` · first ${sevenDayOutlook.nextAction.dateStr}`
                        : ''
                    }`
                  : sevenDayOutlook.watchDays > 0
                    ? `${sevenDayOutlook.watchDays} Watch day${sevenDayOutlook.watchDays === 1 ? '' : 's'}${
                        sevenDayOutlook.nextWatch
                          ? ` · first ${sevenDayOutlook.nextWatch.dateStr}`
                          : ''
                      }`
                    : 'No Watch/Action days in window'}
              </p>
              <p className="text-[10px] text-slate-400 mt-1.5">
                {hasRealForecast ? (
                  <>
                    Observed to {new Date(`${lastObservedDateStr}T12:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} (DPIRD),
                    then MET Norway forecast to {new Date(`${lastForecastDateStr}T12:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                    {forecastUpdatedAt ? ` · updated ${new Date(forecastUpdatedAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}.
                  </>
                ) : (
                  <>
                    Persistence only: weather to {new Date(`${lastObservedDateStr}T12:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} is observed (DPIRD),
                    then carried forward {FORECAST_HORIZON_DAYS} days. MET Norway forecast unavailable.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 flex flex-col relative overflow-hidden">
                {(calculating || isLoadingWeather || loadingParams || isDebouncing) && (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center">
                    <div className="flex flex-col items-center text-emerald-700">
                      <Loader2 className="w-8 h-8 animate-spin mb-2" />
                      <p className="font-medium">
                        {loadingParams ? 'Initializing…' :
                         isLoadingWeather ? `Fetching ${weatherSource} weather…` :
                         isDebouncing ? 'Waiting for input…' :
                         'Updating Ji infection risk…'}
                      </p>
                    </div>
                  </div>
                )}
                
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-slate-900">Infection risk (Ji et al. 2025)</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Primary inoculum × f(T) × f(WD) from budbreak · wetness is a rain/RH proxy until sensors
                    {scoutingStage
                      ? ` · scouted ${growthStageLabel(scoutingStage)} (phenology UI only for now)`
                      : ''}. No chem/bio armour — use Sandbox for spray what-ifs.
                  </p>
                </div>
                
                <div className="w-full h-[420px]">
                  {forecastData.length === 0 && !isLoadingWeather && !loadingParams ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-3">
                      <AlertTriangle className="w-8 h-8 text-amber-500" />
                      <p className="text-sm font-semibold text-slate-800">No forecast series yet</p>
                      <p className="text-xs text-slate-500 max-w-sm">
                        Weather data did not load for the model. Try Manual under Weather, or click Refresh after the server is running.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setWeatherSource('Manual');
                          void handleCalculate();
                        }}
                        className="mt-1 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
                      >
                        Use Manual weather &amp; retry
                      </button>
                    </div>
                  ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={forecastSorted} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
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
                      />
                      <YAxis
                        domain={[0, 'auto']}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 12 }}
                      />
                      <Tooltip content={<BlightChartTooltip />} />
                      <Legend verticalAlign="top" height={36} iconType="circle" />
                      <ReferenceLine
                        y={JI_WATCH_THRESHOLD}
                        stroke="#f59e0b"
                        strokeDasharray="3 3"
                        label={{ value: 'Watch', fill: '#d97706', fontSize: 10 }}
                      />
                      <ReferenceLine
                        y={JI_ACTION_THRESHOLD}
                        stroke="#f43f5e"
                        strokeDasharray="4 4"
                        label={{ value: 'Action', fill: '#f43f5e', fontSize: 10 }}
                      />
                      {forecastData.some((d) => d.isForecast || d.isPersistence) && (() => {
                        const lastObsTs = new Date(`${lastObservedDateStr}T12:00:00`).getTime();
                        const endTs = forecastSorted[forecastSorted.length - 1]?.timestamp;
                        if (!endTs || endTs <= lastObsTs) return null;
                        return (
                          <ReferenceLine
                            x={lastObsTs}
                            stroke="#94a3b8"
                            strokeDasharray="2 2"
                            label={{ value: hasRealForecast ? 'Forecast →' : 'Persistence →', fill: '#64748b', fontSize: 10, position: 'insideTopRight' }}
                          />
                        );
                      })()}
                      <Area
                        type="monotone"
                        dataKey="threat"
                        name="Infection risk (Ji)"
                        fill="#ef4444"
                        fillOpacity={0.8}
                        stroke="#ef4444"
                        strokeWidth={2}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                  )}
                </div>
              </div>
        </div>
      )}
      
      {activeTab === 'historical' && (
        // ==========================================
        // HISTORICAL TAB CONTENT
        // ==========================================
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
      )}

      {activeTab === 'sandbox' && (
        // ==========================================
        // SANDBOX TAB CONTENT
        // ==========================================
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
            {/* Left Sidebar: Sandbox Controls */}
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

            {/* Right Content: Sandbox Chart */}
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
                    <ComposedChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
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
                      <Tooltip content={<BlightChartTooltip />} />
                      <ReferenceLine y={1.0} stroke="#ef4444" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Critical Threshold', fill: '#ef4444', fontSize: 10 }} />
                      
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
                          const filteredData = [...(sandboxView === 'forecast' 
                            ? scenarioData.filter(d => d.fullDate >= todayStr)
                            : scenarioData.filter(d => {
                                const [startYearStr, endYearSuffixStr] = selectedSeason.split('-');
                                const startYear = parseInt(startYearStr);
                                const fullEndYear = 2000 + parseInt(endYearSuffixStr);
                                const seasonStart = new Date(`${startYear}-07-01T00:00:00Z`).getTime();
                                const seasonEnd = new Date(`${fullEndYear}-06-30T23:59:59Z`).getTime();
                                return d.timestamp >= seasonStart && d.timestamp <= seasonEnd && d.fullDate <= todayStr;
                              }))].sort((a, b) => a.timestamp - b.timestamp);

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
                                    <Bar
                                      data={filteredData}
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
                        onClick={handleAutoDistribute}
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
          </div>
        </div>
      )}

      {/* Developer Calibration Panel */}
      {showDevPanel && (
        <div className="fixed bottom-4 right-4 w-96 bg-slate-900 text-slate-200 rounded-xl shadow-2xl border border-slate-700 p-5 z-50 max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4 border-b border-slate-700 pb-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-emerald-400" />
              Algorithm Calibration
            </h2>
            <button onClick={() => setShowDevPanel(false)} className="text-slate-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="space-y-6">
            {/* CDF Tuning */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">1. Canopy Density Factor (CDF)</h3>
              
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">CDF Base Weighting</label>
                <input 
                  type="number" step="0.1"
                  value={calib.cdfBaseWeighting}
                  onChange={(e) => setCalib({...calib, cdfBaseWeighting: Number(e.target.value)})}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">Determines the baseline severity of canopy closure on the microclimate.</p>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">CDF Exponential Effect</label>
                <input 
                  type="number" step="0.1"
                  value={calib.cdfExponentialEffect}
                  onChange={(e) => setCalib({...calib, cdfExponentialEffect: Number(e.target.value)})}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">Determines if the risk scales linearly or exponentially as the canopy gets denser.</p>
              </div>
            </div>

            {/* Natural Threat */}
            <div className="space-y-3 pt-4 border-t border-slate-700">
              <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">2. Natural Threat Multipliers</h3>
              
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Temp Optimum Curve Weight</label>
                <input 
                  type="number" step="0.1"
                  value={calib.tempOptimumWeight}
                  onChange={(e) => setCalib({...calib, tempOptimumWeight: Number(e.target.value)})}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">Adjusts how aggressively the model spikes the threat level when temperatures hit the pathogen's ideal range.</p>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">WD Compounding Rate</label>
                <input 
                  type="number" step="0.01"
                  value={calib.wdCompoundingRate}
                  onChange={(e) => setCalib({...calib, wdCompoundingRate: Number(e.target.value)})}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">The multiplier applied to each consecutive hour of leaf wetness.</p>
              </div>
            </div>

            {/* Chemical Protection — sandbox what-if only */}
            <div className="space-y-3 pt-4 border-t border-slate-700">
              <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">3. Chemical (sandbox what-if)</h3>
              <p className="text-[10px] text-amber-300/90 leading-tight">Affects Sandbox only — not Forecast / Historical threat.</p>
              
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Base Decay Rate (Half-life)</label>
                <input 
                  type="number" step="0.01"
                  value={calib.chemBaseDecayRate}
                  onChange={(e) => setCalib({...calib, chemBaseDecayRate: Number(e.target.value)})}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">Daily drop in hypothetical chem cover (sandbox). Not a measured UV half-life.</p>
              </div>
            </div>

            {/* Biological Protection — sandbox what-if only */}
            <div className="space-y-3 pt-4 border-t border-slate-700">
              <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">4. Biological (sandbox what-if)</h3>
              <p className="text-[10px] text-amber-300/90 leading-tight">Affects Sandbox only — placeholders for scenario comparison.</p>
              
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Bio-Establishment Rate</label>
                <input 
                  type="number" step="0.05"
                  value={calib.bioColonizationEff}
                  onChange={(e) => setCalib({...calib, bioColonizationEff: Number(e.target.value)})}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">Hypothetical take-rate after a sandbox bio spray — not CFU / plaque data.</p>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Bio-Multiplication Rate</label>
                <input 
                  type="number" step="0.05"
                  value={calib.bioFavorableGrowthRate}
                  onChange={(e) => setCalib({...calib, bioFavorableGrowthRate: Number(e.target.value)})}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">Sandbox daily growth factor in favourable weather.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Bio-Survival Rate</label>
                <input 
                  type="number" step="0.01"
                  value={calib.bioEnvDegradationCoef}
                  onChange={(e) => setCalib({...calib, bioEnvDegradationCoef: Number(e.target.value)})}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">Sandbox daily survival when weather turns hostile.</p>
              </div>
            </div>
            
            {/* Epidemiological Modifiers */}
            <div className="space-y-3 pt-4 border-t border-slate-700">
              <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">5. Epidemiological Modifiers</h3>
              
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Secondary Spread Multiplier</label>
                <input 
                  type="number" step="0.1"
                  value={calib.secondarySpreadMultiplier}
                  onChange={(e) => setCalib({...calib, secondarySpreadMultiplier: Number(e.target.value)})}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">Multiplier for the amount of active inoculum injected back into the threat pool when latent infections erupt.</p>
              </div>
            </div>
            
            <div className="pt-4 border-t border-slate-700">
              <button 
                onClick={() => setCalib(defaultCalibration)}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-sm font-medium transition-colors"
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
