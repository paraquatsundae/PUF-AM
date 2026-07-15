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
import { runBlightModel, SprayType, ApplicationMethod, WeatherData, GrowthStage, CalibrationParams, defaultCalibration } from '../lib/blightModel';
import { getBlightAggregate, isAggregateFresh } from '../services/aggregateService';
import { fetchEnvironmentalData, WeatherSource, fetchAllDPIRDStations, calculateDistance } from '../lib/weatherService';
import { useFarmDiary } from '../lib/farmDiary';
import { useMapStore } from '../lib/mapStore';
import { WALNUT_DISTRICTS, PHENOLOGY_STAGES, SEASONS } from '../constants';
import { SandboxMatrix } from '../components/SandboxMatrix';

const seasonMonthsList = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const availableSeasons = SEASONS;

function getDefaultGrowthStage(date: Date): GrowthStage {
  const month = date.getMonth(); // 0-11
  // Southern Hemisphere Walnut Phenology
  if (month >= 4 && month <= 7) return 'dormant'; // May, Jun, Jul, Aug
  if (month === 8) return 'bud_break'; // Sep
  if (month === 9) return 'bloom'; // Oct
  if (month === 10 || month === 11 || month === 0) return 'post_bloom'; // Nov, Dec, Jan
  return 'shell_hardening'; // Feb, Mar, Apr
}

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
    | { T?: number; WD?: number; R?: number; RH?: number; dateStr?: string; fullDate?: string }
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
      <p className="font-semibold text-slate-900 mb-1">{dateLabel}</p>
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
              {typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}
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

  const { userData } = useAuth();
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

    let avgHeight = debouncedParams.calib.treeHeight;
    let avgWidth = debouncedParams.calib.canopyWidth;
    let avgSpacing = debouncedParams.calib.rowSpacing;
    
    if (selectedBlockId) {
      const block = blocks.find(b => b.id === selectedBlockId);
      if (block) {
        avgSpacing = block.rowSpacing || avgSpacing;
      }
    } else if (blocks.length > 0) {
      const totalArea = blocks.reduce((sum, b) => sum + (b.areaHa || 0), 0) || 1;
      let weightedSpacing = 0;
      blocks.forEach(b => {
        const area = b.areaHa || (totalArea / blocks.length);
        const spacing = b.rowSpacing || debouncedParams.calib.rowSpacing;
        weightedSpacing += spacing * area;
      });
      avgSpacing = weightedSpacing / totalArea;
    }

    const canopyCoverage = Math.min(1, avgWidth / avgSpacing);
    const avgKc = 0.2 + (0.8 * canopyCoverage);

    const dynamicCalib = {
      ...debouncedParams.calib,
      treeHeight: avgHeight,
      canopyWidth: avgWidth,
      rowSpacing: avgSpacing,
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
        { includeProtection: true }
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
  const [growthStage, setGrowthStage] = useState<GrowthStage>(getDefaultGrowthStage(todayDate));

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
  const [weatherMeta, setWeatherMeta] = useState<{ lastUpdated?: string; isStale?: boolean; cacheSource?: string } | null>(null);
  const [blightAggregate, setBlightAggregate] = useState<{ currentRiskScore: number; lastUpdated: string } | null>(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState(true);

  useEffect(() => {
    if (!farmId) return;
    getBlightAggregate(farmId).then((agg) => {
      if (agg) setBlightAggregate(agg);
    });
  }, [farmId]);

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
    
    // Calculate block averages or use selected block
    let avgHeight = debouncedParams.calib.treeHeight;
    let avgWidth = debouncedParams.calib.canopyWidth;
    let avgSpacing = debouncedParams.calib.rowSpacing;
    
    if (selectedBlockId) {
      const block = blocks.find(b => b.id === selectedBlockId);
      if (block) {
        avgSpacing = block.rowSpacing || avgSpacing;
      }
    } else if (blocks.length > 0) {
      const totalArea = blocks.reduce((sum, b) => sum + (b.areaHa || 0), 0) || 1; // avoid div by 0
      
      let weightedSpacing = 0;
      
      blocks.forEach(b => {
        const area = b.areaHa || (totalArea / blocks.length);
        const spacing = b.rowSpacing || debouncedParams.calib.rowSpacing;
        weightedSpacing += spacing * area;
      });
      
      avgSpacing = weightedSpacing / totalArea;
    }

    const canopyCoverage = Math.min(1, avgWidth / avgSpacing);
    const avgKc = 0.2 + (0.8 * canopyCoverage);

    const dynamicCalib = {
      ...debouncedParams.calib,
      treeHeight: avgHeight,
      canopyWidth: avgWidth,
      rowSpacing: avgSpacing,
      cropCoefficient: avgKc
    };
    
    // Forecast / historical: weather epidemiology only (no chem/bio armour).
    // Calendar phenology so Historical isn't stuck on today's stage (e.g. July dormant).
    return runBlightModel(
      startDate, 
      endDate, 
      debouncedParams.growthStage, 
      {}, 
      weatherData, 
      irrigationEvents,
      settings.irrigationSystemType,
      dynamicCalib,
      { includeProtection: false, phenologyMode: 'calendar' }
    );
  }, [
    debouncedParams,
    irrigationEvents,
    settings.irrigationSystemType,
    weatherData,
    activeTab,
    sandboxView,
    blocks,
    selectedBlockId,
    todayDate,
    availableSeasons,
  ]);

  // Split data into historical and forecast
  const historicalData = useMemo(() => allData.filter(d => d.fullDate <= todayStr), [allData, todayStr]);
  const forecastData = useMemo(() => allData.filter(d => d.fullDate >= todayStr), [allData, todayStr]);

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
    
    // Calculate block averages
    let baseHeight = debouncedParams.calib.treeHeight;
    let baseWidth = debouncedParams.calib.canopyWidth;
    let baseSpacing = debouncedParams.calib.rowSpacing;
    
    if (blocks.length > 0) {
      const totalArea = blocks.reduce((sum, b) => sum + (b.areaHa || 0), 0) || 1; 
      let weightedSpacing = 0;
      
      blocks.forEach(b => {
        const area = b.areaHa || (totalArea / blocks.length);
        const spacing = b.rowSpacing || debouncedParams.calib.rowSpacing;
        weightedSpacing += spacing * area;
      });
      
      baseSpacing = weightedSpacing / totalArea;
    }

    const results: Record<string, any[]> = {};

    scenarios.forEach(scenario => {
      // Only calculate for active scenario OR all if compareAllScenarios is true
      if (!compareAllScenarios && scenario.id !== activeScenarioId) return;

      let scenarioHeight = scenario.treeHeight !== null ? scenario.treeHeight : baseHeight;
      let scenarioWidth = scenario.canopyWidth !== null ? scenario.canopyWidth : baseWidth;
      let scenarioSpacing = scenario.rowSpacing !== null ? scenario.rowSpacing : baseSpacing;
      
      const scenarioCoverage = Math.min(1, scenarioWidth / scenarioSpacing);
      const scenarioKc = 0.2 + (0.8 * scenarioCoverage);

      const dynamicCalib = {
        ...debouncedParams.calib,
        treeHeight: scenarioHeight,
        canopyWidth: scenarioWidth,
        rowSpacing: scenarioSpacing,
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
        { includeProtection: true, phenologyMode: 'fixed' }
      );
    });

    return results;
  }, [debouncedParams, sprayEvents, irrigationEvents, settings.irrigationSystemType, weatherData, activeTab, blocks, scenarios, activeScenarioId, compareAllScenarios, sandboxView]);

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

      const highRiskDays = seasonData.filter(d => d.threat > 0.8).length;
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
    const highRiskDays = filteredHistoricalData.filter(d => d.threat > 0.8).length;
    const dateSet = new Set(filteredHistoricalData.map(d => d.fullDate));
    const totalSprays = events.filter(e => e.type === 'spray' && dateSet.has(e.date)).length;
    const avgThreat = filteredHistoricalData.length 
      ? (filteredHistoricalData.reduce((acc, curr) => acc + curr.threat, 0) / filteredHistoricalData.length).toFixed(2)
      : '0.00';

    // Stage-Aware Aggregation
    const stageBreakdown = PHENOLOGY_STAGES.map(stage => {
      const stageData = filteredHistoricalData.filter(d => {
        const date = new Date(d.timestamp);
        const month = date.getUTCMonth();
        const day = date.getUTCDate();
        const seasonMonthIndex = month >= 6 ? month - 6 : month + 6;
        const progress = seasonMonthIndex + (day / 31);
        return progress >= stage.startMonth && progress < stage.endMonth;
      });

      const avgStageThreat = stageData.length
        ? (stageData.reduce((acc, curr) => acc + curr.threat, 0) / stageData.length).toFixed(2)
        : '0.00';
      
      const stageDates = new Set(stageData.map(d => d.fullDate));
      const stageSprays = events.filter(e => e.type === 'spray' && stageDates.has(e.date)).length;
      const stageHighRiskDays = stageData.filter(d => d.threat > 0.8).length;

      return {
        ...stage,
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

  const chartData = useMemo(() => {
    if (!compareWithPrevious) return filteredHistoricalData;
    
    return filteredHistoricalData.map((d, i) => ({
      ...d,
      prevThreat: comparisonData[i]?.prevThreat,
      prevChem: comparisonData[i]?.prevChem,
      prevBio: comparisonData[i]?.prevBio,
    }));
  }, [filteredHistoricalData, comparisonData, compareWithPrevious]);

  // Derived UI states
  const isOverLimit = !usageLoading && !checkLimit('calculations');
  const currentWeather = forecastData[0] || { T: 0, RH: 0, R: 0, WD: 0 };
  
  // Find if there is a critical day in the next 7 days (weather risk only — no modelled armour)
  const criticalDay = forecastData.slice(0, 7).find(d => d.threat > 0.8);

  // Summary stats for glanceable header
  const modelCurrentRisk = forecastData[0]?.threat || 0;
  const useAggregate = blightAggregate && isAggregateFresh(blightAggregate.lastUpdated);
  const currentRisk = useAggregate ? blightAggregate!.currentRiskScore : modelCurrentRisk;

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
          ['High Risk Days (> 0.8)', historicalStats.highRiskDays.toString()],
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
        .filter(d => d.threat > 0.8)
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
        doc.text('Detailed data for days where threat exceeded 0.8 threshold.', 14, 28);
        
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
        doc.text('No high-risk events (threat > 0.8) recorded during this period.', 14, 220);
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
              Do you need to spray, and is protection still holding?
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

          <label className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide" title="Sandbox only — Forecast/Historical use calendar phenology">
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
      </div>

      {/* Compact status strip — one row */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-white px-2.5 py-2 rounded-lg border border-slate-200 min-w-0">
          <div className="flex items-center gap-1 text-[9px] font-bold text-slate-500 uppercase tracking-wide truncate">
            <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
            Risk
            {useAggregate && <span className="text-slate-400 font-medium normal-case tracking-normal">· agg</span>}
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className={cn(
              "text-lg font-black tracking-tight leading-none",
              currentRisk > 0.7 ? "text-rose-600" : currentRisk > 0.4 ? "text-amber-600" : "text-emerald-600"
            )}>
              {(currentRisk * 100).toFixed(0)}%
            </span>
            <span className="text-[9px] font-medium text-slate-400 truncate">/ 80%</span>
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
              {lastSprayDate === 'N/A' ? 'None' : (isProtected ? 'Recent' : 'Older')}
            </span>
            <span className="text-[9px] font-medium text-slate-400 truncate">
              {lastSprayDate === 'N/A' ? 'diary' : lastSprayDate}
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
          {/* Dynamic Alert Box */}
          {criticalDay && (
            <div className="bg-rose-50 border-l-4 border-rose-500 p-5 rounded-r-xl shadow-sm flex items-start gap-4">
              <div className="bg-rose-100 p-2 rounded-full mt-0.5">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-rose-900 mb-1">Critical blight window</h3>
                <p className="text-rose-800 font-medium leading-relaxed">
                  High infection pressure ({criticalDay.threat}) on {criticalDay.dateStr}
                  — {criticalDay.T}°C and {criticalDay.WD} wetness hours in the weather drivers.
                </p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 flex flex-col relative overflow-hidden">
                {(calculating || isLoadingWeather || loadingParams || isDebouncing) && (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center">
                    <div className="flex flex-col items-center text-emerald-700">
                      <Loader2 className="w-8 h-8 animate-spin mb-2" />
                      <p className="font-medium">
                        {loadingParams ? 'Initializing engine parameters...' : 
                         isLoadingWeather ? `Fetching ${weatherSource} weather data...` : 
                         isDebouncing ? 'Waiting for input stabilization...' :
                         'Recalculating epidemiological models...'}
                      </p>
                    </div>
                  </div>
                )}
                
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-slate-900">Infection risk (weather-driven)</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Temperature · wetness · phenology · latency · secondary spread. Spray efficacy is sandbox-only.
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
                    <ComposedChart data={[...forecastData].sort((a, b) => a.timestamp - b.timestamp)} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
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
                        domain={[0, 1.5]} 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#64748b', fontSize: 12 }} 
                      />
                      <Tooltip content={<BlightChartTooltip />} />
                      <Legend verticalAlign="top" height={36} iconType="circle" />
                      
                      <Area type="monotone" dataKey="threat" name="Infectious pressure" fill="#ef4444" fillOpacity={0.8} stroke="#ef4444" strokeWidth={2} />
                      <Area type="monotone" dataKey="latentThreat" name="Incubating infections" fill="#fef3c7" fillOpacity={0.5} stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" />
                      <Bar dataKey="eruptingThreat" name="Symptom eruptions" fill="#b91c1c" barSize={4} />
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
                      <p className="text-sm text-slate-500 mb-0.5">days &gt; 0.8 threat</p>
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
                                    Simultaneous chemical and biological application may reduce biological colonization efficiency.
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
                    <h2 className="text-xl font-bold text-slate-900">Historical Blight Pressure & Protection</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      Reviewing {timeRange === 'Custom' ? `${seasonMonthsList[customStartMonth]} - ${seasonMonthsList[customEndMonth]}` : `past ${timeRange}`} for Season {selectedSeason}
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
                    Risk Breakdown by Growth Stage
                  </h3>
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
                        name="Infectious pressure" 
                        fill="#ef4444" 
                        fillOpacity={0.3} 
                        stroke="#ef4444" 
                        strokeWidth={1} 
                      />
                      <Area 
                        type="monotone" 
                        dataKey="latentThreat" 
                        name="Incubating infections" 
                        fill="#fef3c7" 
                        fillOpacity={0.5} 
                        stroke="#f59e0b" 
                        strokeWidth={1} 
                        strokeDasharray="5 5"
                      />
                      <Bar dataKey="eruptingThreat" name="Symptom eruptions" fill="#b91c1c" barSize={4} />
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
          </p>

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

              <div className="flex items-center gap-3">
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
                          data={[...(sandboxView === 'forecast' ? forecastData : filteredHistoricalData)].sort((a, b) => a.timestamp - b.timestamp)} 
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

            {/* Chemical Protection */}
            <div className="space-y-3 pt-4 border-t border-slate-700">
              <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">3. Chemical Protection Multipliers</h3>
              
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Base Decay Rate (Half-life)</label>
                <input 
                  type="number" step="0.01"
                  value={calib.chemBaseDecayRate}
                  onChange={(e) => setCalib({...calib, chemBaseDecayRate: Number(e.target.value)})}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">The daily percentage drop in chemical efficacy due to UV breakdown and natural degradation.</p>
              </div>
            </div>

            {/* Biological Protection */}
            <div className="space-y-3 pt-4 border-t border-slate-700">
              <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">4. Biological Protection Multipliers</h3>
              
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Bio-Establishment Rate</label>
                <input 
                  type="number" step="0.05"
                  value={calib.bioColonizationEff}
                  onChange={(e) => setCalib({...calib, bioColonizationEff: Number(e.target.value)})}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">The Establishment Phase: Defines the baseline survival and colonization rate immediately following the spray event.</p>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Bio-Multiplication Rate</label>
                <input 
                  type="number" step="0.05"
                  value={calib.bioFavorableGrowthRate}
                  onChange={(e) => setCalib({...calib, bioFavorableGrowthRate: Number(e.target.value)})}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">The multiplier dictating how aggressively the biological population multiplies and spreads when environmental conditions are ideal.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Bio-Survival Rate</label>
                <input 
                  type="number" step="0.01"
                  value={calib.bioEnvDegradationCoef}
                  onChange={(e) => setCalib({...calib, bioEnvDegradationCoef: Number(e.target.value)})}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">The rate at which the biological agent survives when conditions turn hostile.</p>
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
