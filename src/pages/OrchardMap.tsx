import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layers, MapPin, BarChart3, Plus, Settings2, Info, X, Radio, Bug, Search, Loader2, ShieldCheck, Menu, Weight, Route, ClipboardList, User, Calendar, AlertCircle, ArrowLeft, CircleHelp, HardDrive, RefreshCw, FileUp, Hexagon } from 'lucide-react';
import { House as PhHouse, Crosshair as PhCrosshair, Flag as PhFlag } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, ZoomControl, FeatureGroup, Circle, Marker } from 'react-leaflet';
import L from '../lib/leaflet-setup';
import { StableEditControl } from '../components/map/StableEditControl';
import type { Map as LeafletMap } from 'leaflet';
import * as turf from '@turf/turf';
import { runBlightModel, WeatherData, defaultCalibration } from '../lib/blightModel';
import { fetchEnvironmentalData } from '../lib/weatherService';
import { useFarmDiary } from '../lib/farmDiary';
import { useAuth } from '../contexts/AuthContext';
import { useMapStore, OrchardBlock, InfrastructurePin, FarmTrack } from '../lib/mapStore';
import { EventMarkerCluster } from '../components/map/EventMarkerCluster';
import { GoogleMapsLayer } from '../components/map/GoogleMapsLayer';
import {
  preferEsriSatelliteBasemap,
  resolveGoogleMapsApiKey,
} from '../lib/googleMapsKey';
import { CachedTileLayer } from '../components/map/CachedTileLayer';
import { FarmBasemapSetup } from '../components/map/FarmBasemapSetup';
import { BlockOperateCard } from '../components/map/BlockOperateCard';
import { OperateIssuesLayer } from '../components/map/OperateIssuesLayer';
import { ReportIssueSheet } from '../components/map/ReportIssueSheet';
import { BlockIssuesSheet } from '../components/map/BlockIssuesSheet';
import { AddIssueIcon } from '../components/map/AddIssueIcon';
import {
  getBasemapPack,
  clearBasemapPack,
  bboxCenter,
  formatPackBytes,
  getBasemapSkipped,
  setBasemapSkipped,
  ESRI_ATTRIBUTION,
  type BasemapPack,
} from '../lib/basemapPack';
import { blocksToLeafletBounds } from '../lib/farmBounds';
import { countOpenIssuesByBlock, issuesForBlock } from '../lib/blockIssueCounts';
import { CULTIVARS } from '../lib/chillPortions';
import { useFarmChillPortions } from '../hooks/useFarmChillPortions';
import { useChillPack } from '../hooks/useChillPack';
import { useFieldStore, type FieldIssue } from '../lib/fieldStore';
import { cn } from '../lib/utils';
import { collection, query, orderBy, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase';
import debounce from 'lodash/debounce';
import { isLocalOnlyFarmSession } from '../lib/workshopMode';
import {
  cancelActiveDrawer,
  clearDrawUiIgnoreWindow,
  getCurrentDrawHandler,
  reviveActiveDrawer,
  startActiveDrawer,
  type LeafletDrawHandler,
} from '../lib/mapDrawHelpers';
import { DrawingActionBar } from '../components/map/DrawingActionBar';
import {
  BoundaryEditActionBar,
  type InternalBoundaryKind,
} from '../components/map/BoundaryEditActionBar';
import { BoundaryImportSheet } from '../components/map/BoundaryImportSheet';
import {
  UserLocationLayer,
  type UserGeoFix,
} from '../components/map/UserLocationLayer';
import { CrewPresenceLayer } from '../components/map/CrewPresenceLayer';
import { useCrewPresence } from '../hooks/useCrewPresence';
import { useMapHighlights } from '../hooks/useMapHighlights';
import { MapHighlightsLayer } from '../components/map/MapHighlightsLayer';
import { BreadTrailLayer } from '../components/map/BreadTrailLayer';
import { BreadTrailToggles } from '../components/map/BreadTrailToggles';
import { PaddockNameLayer } from '../components/map/PaddockNameLayer';
import { HighlightComposeSheet } from '../components/map/HighlightComposeSheet';
import {
  canEnableEveryoneTrails,
  readBreadTrailPrefs,
  writeBreadTrailPrefs,
  type BreadTrailPrefs,
} from '../lib/breadTrails';
import { NewPaddockSheet } from '../components/map/NewPaddockSheet';
import {
  boundaryEditVertexCount,
  cancelBoundaryEdit,
  commitBoundaryEdit,
  deleteSelectedVertex,
  startBoundaryEdit,
  type BoundaryEditSession,
} from '../lib/boundaryEditSession';
import {
  areaWordForCropKind,
  defaultGeometryKind,
  getEnterprise,
  isTreeCropKind,
  mapUiCopy,
  primaryEnterprise,
  resolveFarmProfile,
  type FarmEnterpriseId,
} from '../../shared/farm/farmTypes';
import {
  defaultInfraName,
  getInfraType,
  INFRA_TYPES,
  infraDrawMode,
  infraSubtractsFromPaddock,
  type InfraTypeId,
} from '../../shared/farm/infraTypes';
import {
  asFeature,
  effectivePaddockAreaHa,
  internalBoundariesIntersectingBlock,
  isInternalBoundaryType,
  parsePossiblyStringifiedGeojson,
  polygonMostlyOutsideBlock,
  recomputeBlockAreasForFarm,
  subtractingExclusionPolygons,
} from '../lib/paddockExclusions';
import {
  applyInfraPolygonPattern,
  ensureInfraFillPatterns,
  infraPolygonPathStyle,
  PUFAM_FILL_PATTERN_CSS,
} from '../lib/infraMapStyles';
import {
  PUFAM_TRACK_STROKE_CSS,
  TRACK_COLOR_DRAW,
  trackCategoryChipClass,
  trackPathStyle,
} from '../lib/trackMapStyles';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

// Workaround for leaflet-draw bug: Uncaught ReferenceError: type is not defined
// This occurs when showArea is true in polygon draw options.
if (typeof window !== 'undefined') {
  (window as any).type = '';
}

type MapMode = 'operate' | 'edit';
type SubTab = 'blocks' | 'infrastructure' | 'tracks' | 'analytics';

function MapStatusBar({ map, activeTab }: { map: LeafletMap | null, activeTab: string }) {
  const [mapState, setMapState] = useState({ lat: -33.9249, lng: 115.0750, zoom: 15 });

  useEffect(() => {
    if (!map) return;
    
    const updateState = () => {
      const center = map.getCenter();
      setMapState({
        lat: center.lat,
        lng: center.lng,
        zoom: map.getZoom()
      });
    };

    updateState();
    map.on('moveend', updateState);
    map.on('zoomend', updateState);
    
    return () => {
      map.off('moveend', updateState);
      map.off('zoomend', updateState);
    };
  }, [map]);

  return (
    <div className="absolute bottom-20 lg:bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 pointer-events-none z-[1000] w-full px-4 justify-center">
      <div className="bg-slate-900/80 backdrop-blur-md text-white px-4 sm:px-6 py-2 sm:py-3 rounded-full shadow-lg border border-white/10 flex items-center gap-3 sm:gap-4 pointer-events-auto max-w-full overflow-hidden">
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider">{activeTab}</span>
        </div>
        <div className="w-px h-4 bg-white/20 flex-shrink-0" />
        <div className="text-[9px] sm:text-[10px] font-mono text-slate-300 tracking-wider truncate">
          <span className="hidden sm:inline">{mapState.lat.toFixed(4)}, {mapState.lng.toFixed(4)} • </span>Z{mapState.zoom}
        </div>
      </div>
    </div>
  );
}

export function OrchardMap() {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusIssueId = searchParams.get('issue');
  const focusedIssueRef = useRef<string | null>(null);
  const { userData } = useAuth();
  const farmId = userData?.farmId;
  const [mapMode, setMapMode] = useState<MapMode>('operate');
  const [activeTab, setActiveTab] = useState<SubTab>('blocks');
  const [mapLayer, setMapLayer] = useState<'vector' | 'satellite'>('satellite');
  const fieldIssues = useFieldStore((s) => s.issues);
  const loadFieldData = useFieldStore((s) => s.loadData);
  const addFieldIssue = useFieldStore((s) => s.addIssue);
  const updateFieldIssue = useFieldStore((s) => s.updateIssue);
  const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);
  const [showIssueFlags, setShowIssueFlags] = useState(false);
  const [placingFlag, setPlacingFlag] = useState(false);
  const [placingHighlight, setPlacingHighlight] = useState(false);
  const [highlightDraftGeo, setHighlightDraftGeo] = useState<
    GeoJSON.Feature | GeoJSON.Geometry | null
  >(null);
  const [highlightSending, setHighlightSending] = useState(false);
  const [trailPrefs, setTrailPrefs] = useState<BreadTrailPrefs>(() => readBreadTrailPrefs());
  const [issuesPanelBlockId, setIssuesPanelBlockId] = useState<string | null>(null);
  const [reportDraft, setReportDraft] = useState<{
    lat: number;
    lng: number;
    blockId?: string;
  } | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<FieldIssue | null>(null);
  const [userFix, setUserFix] = useState<UserGeoFix | null>(null);
  const [followUser, setFollowUser] = useState(false);
  const {
    others: crewOthers,
    selfTrail: crewSelfTrail,
    nearbyCount: crewNearby,
    sharing: crewSharing,
    publishStatus: crewPublishStatus,
    lastError: crewError,
  } = useCrewPresence({
    farmId,
    uid: userData?.uid,
    displayName: userData?.displayName || userData?.email,
    fix: userFix,
    enabled: Boolean(farmId && userData?.uid),
  });
  /** Fresh polygon — naming sheet (not the full metadata modal). */
  const [namingBlock, setNamingBlock] = useState<OrchardBlock | null>(null);

  const googleMapsApiKey = resolveGoogleMapsApiKey();
  /** Native Capacitor: Esri first (Google referrer/key often blanks LAN WebView). */
  const [useGoogleSatellite, setUseGoogleSatellite] = useState(
    () => Boolean(resolveGoogleMapsApiKey()) && !preferEsriSatelliteBasemap()
  );

  const [basemapPack, setBasemapPack] = useState<BasemapPack | null>(null);
  const [basemapChecked, setBasemapChecked] = useState(false);
  const [showBasemapSetup, setShowBasemapSetup] = useState(false);
  const [basemapBusy, setBasemapBusy] = useState(false);
  const [basemapSkipped, setBasemapSkippedState] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    let capHandle: { remove: () => Promise<void> } | undefined;
    void (async () => {
      try {
        const { Network } = await import('@capacitor/network');
        const status = await Network.getStatus();
        setIsOnline(Boolean(status.connected));
        capHandle = await Network.addListener('networkStatusChange', (s) => {
          setIsOnline(Boolean(s.connected));
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      void capHandle?.remove();
    };
  }, []);

  const refreshBasemapPack = useCallback(async () => {
    if (!farmId) {
      setBasemapPack(null);
      setBasemapSkippedState(false);
      setBasemapChecked(true);
      return;
    }
    try {
      const pack = await getBasemapPack(farmId);
      const skipped = getBasemapSkipped(farmId);
      setBasemapPack(pack);
      setBasemapSkippedState(skipped);
      setShowBasemapSetup(!pack && !skipped);
    } catch (e) {
      console.error('[Basemap] Failed to read pack:', e);
      setBasemapPack(null);
      const skipped = getBasemapSkipped(farmId);
      setBasemapSkippedState(skipped);
      setShowBasemapSetup(!skipped);
    } finally {
      setBasemapChecked(true);
    }
  }, [farmId]);

  useEffect(() => {
    setBasemapChecked(false);
    refreshBasemapPack();
  }, [refreshBasemapPack]);

  const openBasemapSetup = (clearSkip = false) => {
    if (farmId && clearSkip) setBasemapSkipped(farmId, false);
    if (clearSkip) setBasemapSkippedState(false);
    setShowBasemapSetup(true);
  };

  const handleClearBasemap = async () => {
    if (!farmId) return;
    if (!confirm('Clear the local farm satellite map from this device? You will need to download it again.')) {
      return;
    }
    setBasemapBusy(true);
    try {
      await clearBasemapPack(farmId);
      setBasemapPack(null);
      setBasemapSkipped(farmId, false);
      setBasemapSkippedState(false);
      setShowBasemapSetup(true);
    } catch (e) {
      console.error(e);
      alert('Failed to clear local map.');
    } finally {
      setBasemapBusy(false);
    }
  };

  useEffect(() => {
    setMapLayer('satellite');
  }, [activeTab]);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  
  // Phase 2 & 3: Persistent Map State
  const {
    blocks,
    pins,
    tracks,
    viewport,
    setViewport,
    setBounds,
    addBlock,
    updateBlock,
    removeBlock,
    addPin,
    updatePin,
    removePin,
    addTrack,
    updateTrack,
    removeTrack,
    isLoaded,
    canEdit,
    pendingSyncCount,
    syncError,
    clearSyncError,
    flushSync,
    loadData,
  } = useMapStore();

  /** Once we've framed the paddocks for this farm, don't keep re-zooming on edits. */
  const fittedToBlocksFarmRef = React.useRef<string | null>(null);
  const fittedFallbackFarmRef = React.useRef<string | null>(null);

  useEffect(() => {
    fittedToBlocksFarmRef.current = null;
    fittedFallbackFarmRef.current = null;
  }, [farmId]);

  const fitFarmInView = useCallback(
    (opts?: { animate?: boolean }) => {
      if (!mapInstance) return false;
      const blockBounds = blocksToLeafletBounds(blocks);
      if (blockBounds) {
        mapInstance.fitBounds(blockBounds, {
          padding: [48, 48],
          maxZoom: 17,
          animate: opts?.animate ?? true,
        });
        const center = mapInstance.getCenter();
        setViewport({ lat: center.lat, lng: center.lng, zoom: mapInstance.getZoom() });
        return true;
      }
      if (basemapPack) {
        mapInstance.fitBounds(
          [
            [basemapPack.bbox.south, basemapPack.bbox.west],
            [basemapPack.bbox.north, basemapPack.bbox.east],
          ],
          { padding: [32, 32], maxZoom: 16, animate: opts?.animate ?? true }
        );
        const c = bboxCenter(basemapPack.bbox);
        setViewport({ lat: c.lat, lng: c.lng, zoom: mapInstance.getZoom() });
        return true;
      }
      return false;
    },
    [mapInstance, blocks, basemapPack, setViewport]
  );

  // Default view: encompass all paddocks (not the whole district)
  useEffect(() => {
    if (!mapInstance || !isLoaded || !farmId) return;

    if (blocks.length > 0) {
      if (fittedToBlocksFarmRef.current === farmId) return;
      if (fitFarmInView({ animate: false })) {
        fittedToBlocksFarmRef.current = farmId;
      }
      return;
    }

    if (basemapPack && fittedFallbackFarmRef.current !== farmId) {
      if (fitFarmInView({ animate: false })) {
        fittedFallbackFarmRef.current = farmId;
      }
    }
  }, [mapInstance, isLoaded, farmId, blocks, basemapPack, fitFarmInView]);

  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [highlightedBlockId, setHighlightedBlockId] = useState<string | null>(null);
  const highlightedBlockIdRef = React.useRef<string | null>(null);
  highlightedBlockIdRef.current = highlightedBlockId;
  const [editingPinId, setEditingPinId] = useState<string | null>(null);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [highlightedTrackId, setHighlightedTrackId] = useState<string | null>(null);
  const highlightedTrackIdRef = React.useRef<string | null>(null);
  highlightedTrackIdRef.current = highlightedTrackId;
  const [isConfirmingDeleteBlock, setIsConfirmingDeleteBlock] = useState(false);
  const [isConfirmingDeletePin, setIsConfirmingDeletePin] = useState(false);
  const [isConfirmingDeleteTrack, setIsConfirmingDeleteTrack] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  
  const featureGroupRef = React.useRef<any>(null);
  const layerMapRef = React.useRef<Record<number, { type: 'block' | 'pin' | 'track'; id: string }>>({});
  const activeDrawerRef = React.useRef<LeafletDrawHandler | null>(null);
  const boundaryEditRef = React.useRef<BoundaryEditSession | null>(null);
  const [boundaryEditBlockId, setBoundaryEditBlockId] = useState<string | null>(null);
  const [boundaryEditTick, setBoundaryEditTick] = useState(0);
  const [showBoundaryImport, setShowBoundaryImport] = useState(false);
  /** What infrastructure Quick Add / draw tools create. */
  const [infraDrawKind, setInfraDrawKind] = useState<Exclude<InfraTypeId, ''>>('standpipe');
  const activeTabRef = useRef<SubTab>(activeTab);
  activeTabRef.current = activeTab;
  const infraDrawKindRef = useRef(infraDrawKind);
  infraDrawKindRef.current = infraDrawKind;
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  /** Blocks-tab draw of an internal pad / hazard (not a new paddock). */
  const internalBoundaryDrawRef = useRef<{
    kind: InternalBoundaryKind;
    blockId: string;
  } | null>(null);
  /** Ignore DRAWSTOP from cancelActiveDrawer while arming a new internal draw. */
  const skipInternalDrawClearRef = useRef(false);
  const [internalBoundaryDrawing, setInternalBoundaryDrawing] = useState<{
    kind: InternalBoundaryKind;
    blockId: string;
  } | null>(null);
  const [forceRender, setForceRender] = useState(0);

  // Phase 4.3: Farm Diary Integration
  const diaryDateRange = React.useMemo(() => {
    const start = new Date();
    start.setMonth(start.getMonth() - 3);
    const end = new Date();
    end.setMonth(end.getMonth() + 1);
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
  }, []);
  const { events, settings, getSprayEvents, getIrrigationEvents } = useFarmDiary(diaryDateRange.start, diaryDateRange.end);
  const showChill = useChillPack();
  const farmChill = useFarmChillPortions(
    viewport.lat,
    viewport.lng,
    showChill,
    settings.dpirdStationCode,
    settings.dpirdStationName
  );
  const mapCopy = useMemo(() => mapUiCopy(settings.farmProfile), [settings.farmProfile]);
  const {
    highlights: mapHighlights,
    createHighlight,
    removeHighlight,
    canDelete: canDeleteHighlight,
  } = useMapHighlights({
    farmId,
    uid: userData?.uid,
    displayName: userData?.displayName || userData?.email,
    role: userData?.role,
    farmDefaultSeconds: settings.highlightDefaultSeconds,
    enabled: Boolean(farmId && userData?.uid),
  });
  const placingHighlightRef = useRef(false);
  placingHighlightRef.current = placingHighlight;

  const updateTrailPrefs = useCallback((next: BreadTrailPrefs) => {
    const gated: BreadTrailPrefs = {
      ...next,
      showEveryone: canEnableEveryoneTrails(userData?.role) ? next.showEveryone : false,
    };
    setTrailPrefs(gated);
    writeBreadTrailPrefs(gated);
  }, [userData?.role]);

  useEffect(() => {
    if (!canEnableEveryoneTrails(userData?.role) && trailPrefs.showEveryone) {
      updateTrailPrefs({ ...trailPrefs, showEveryone: false });
    }
  }, [userData?.role, trailPrefs, updateTrailPrefs]);

  const startHighlightPaint = useCallback(() => {
    if (!mapInstance || mapMode !== 'operate') return;
    setPlacingFlag(false);
    setReportDraft(null);
    setHighlightDraftGeo(null);
    setPlacingHighlight(true);
    if (!(L as any).Draw) {
      console.error('Leaflet Draw not initialized');
      setPlacingHighlight(false);
      return;
    }
    try {
      startActiveDrawer(
        activeDrawerRef,
        new (L as any).Draw.Polygon(mapInstance, {
          shapeOptions: {
            color: '#0f766e',
            fillColor: '#0f766e',
            fillOpacity: 0.25,
            weight: 2,
          },
        })
      );
    } catch (err) {
      console.error('Failed to start highlight draw', err);
      cancelActiveDrawer(activeDrawerRef);
      setPlacingHighlight(false);
    }
  }, [mapInstance, mapMode]);

  const cancelHighlightPaint = useCallback(() => {
    setPlacingHighlight(false);
    setHighlightDraftGeo(null);
    cancelActiveDrawer(activeDrawerRef);
  }, []);

  // Phase 4.3: Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Weather Data State
  const [environmentalData, setEnvironmentalData] = useState<any | null>(null);
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);

  // Phase 2: Harvest Yield State
  const [harvests, setHarvests] = useState<any[]>([]);
  const [analyticsView, setAnalyticsView] = useState<'risk' | 'yield'>('risk');

  const findBlockIdAt = useCallback(
    (lat: number, lng: number): string | undefined => {
      const pt = turf.point([lng, lat]);
      for (const block of blocks) {
        if (!block.geojson) continue;
        try {
          if (turf.booleanPointInPolygon(pt, block.geojson)) return block.id;
        } catch {
          /* skip bad geometry */
        }
      }
      return undefined;
    },
    [blocks]
  );

  const fitBlockInView = useCallback(
    (block: OrchardBlock, opts?: { animate?: boolean }) => {
      if (!mapInstance) return;
      const bounds = blocksToLeafletBounds([block]);
      if (!bounds) return;
      mapInstance.fitBounds(bounds, {
        padding: [56, 56],
        maxZoom: 18,
        animate: opts?.animate ?? true,
      });
    },
    [mapInstance]
  );

  // Place issue flag, or clear selection on map background click
  useEffect(() => {
    if (!mapInstance) return;
    const handleMapClick = (e: any) => {
      if (e.originalEvent?._stopped) return;
      if (placingHighlightRef.current) return;
      // Pan/zoom trailing clicks and tap-to-place both fire map click.
      // Never deselect the source paddock (or cancel context) while drawing /
      // vertex-editing — especially internal-boundary hazard/pad from Blocks.
      if (getCurrentDrawHandler()?._enabled) return;
      if (internalBoundaryDrawRef.current) return;
      if (boundaryEditRef.current) return;
      if (placingFlag && mapMode === 'operate') {
        const lat = e.latlng.lat as number;
        const lng = e.latlng.lng as number;
        const blockId =
          findBlockIdAt(lat, lng) || highlightedBlockIdRef.current || undefined;
        setReportDraft({ lat, lng, blockId });
        setPlacingFlag(false);
        setIssuesPanelBlockId(null);
        setSelectedIssue(null);
        return;
      }
      setHighlightedBlockId(null);
      setIssuesPanelBlockId(null);
      setSelectedIssue(null);
    };
    mapInstance.on('click', handleMapClick);
    return () => {
      mapInstance.off('click', handleMapClick);
    };
  }, [mapInstance, placingFlag, mapMode, findBlockIdAt]);

  // Finish “check this” polygon paint in operate mode
  useEffect(() => {
    if (!mapInstance) return;
    const DrawEvent = (L as unknown as { Draw?: { Event?: Record<string, string> } }).Draw?.Event;
    const CREATED = DrawEvent?.CREATED || 'draw:created';
    const onCreated = (e: {
      layerType?: string;
      layer: L.Layer & { toGeoJSON?: () => GeoJSON.Feature; remove?: () => void };
    }) => {
      if (!placingHighlightRef.current) return;
      if (e.layerType && e.layerType !== 'polygon') return;
      try {
        const geojson = e.layer.toGeoJSON?.();
        if (geojson) {
          setHighlightDraftGeo(geojson);
        }
      } catch (err) {
        console.warn('[OrchardMap] highlight geojson failed', err);
      }
      try {
        e.layer.remove?.();
        mapInstance.removeLayer(e.layer);
      } catch {
        /* ignore */
      }
      cancelActiveDrawer(activeDrawerRef);
      setPlacingHighlight(false);
    };
    mapInstance.on(CREATED, onCreated as L.LeafletEventHandlerFn);
    return () => {
      mapInstance.off(CREATED, onCreated as L.LeafletEventHandlerFn);
    };
  }, [mapInstance]);

  // Leave highlight tool when leaving operate mode
  useEffect(() => {
    if (mapMode !== 'operate' && (placingHighlight || highlightDraftGeo)) {
      cancelHighlightPaint();
    }
  }, [mapMode, placingHighlight, highlightDraftGeo, cancelHighlightPaint]);

  // Zoom selected operate block to fit the screen for easier pin placement
  useEffect(() => {
    if (mapMode !== 'operate' || !highlightedBlockId || !mapInstance) return;
    const block = blocks.find((b) => b.id === highlightedBlockId);
    if (!block?.geojson) return;
    fitBlockInView(block);
    // Only re-fit when the selection changes — not on every blocks refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [highlightedBlockId, mapMode, mapInstance]);

  // Load field issues for open-issue counts on the operate card
  useEffect(() => {
    if (farmId) loadFieldData(farmId);
  }, [farmId, loadFieldData]);

  // Deep-link: /map?issue=<id> → show flags, fly to pin, open detail
  useEffect(() => {
    if (!focusIssueId) {
      focusedIssueRef.current = null;
      return;
    }
    if (!mapInstance || mapMode !== 'operate') return;
    if (focusedIssueRef.current === focusIssueId) return;

    const issue = fieldIssues.find((i) => i.id === focusIssueId);
    if (!issue) return;

    focusedIssueRef.current = focusIssueId;
    setShowIssueFlags(true);
    setPlacingFlag(false);
    setReportDraft(null);
    setIssuesPanelBlockId(null);
    setHighlightedBlockId(null);
    setSelectedIssue(issue);
    mapInstance.flyTo([issue.lat, issue.lng], 18, { animate: true });

    const next = new URLSearchParams(searchParams);
    next.delete('issue');
    setSearchParams(next, { replace: true });
  }, [focusIssueId, fieldIssues, mapInstance, mapMode, searchParams, setSearchParams]);

  // Handle layer clicks for highlighting (or pin drop when placing)
  useEffect(() => {
    if (!mapInstance || !featureGroupRef.current) return;
    
    const fg = featureGroupRef.current;
    const handleLayerClick = (e: any) => {
      // Never steal taps while a draw tool or boundary-edit session is active —
      // paddocks cover most of the farm, so this used to cancel infra/track draws
      // and force the Blocks tab mid-placement.
      // Mark _stopped so map background-click cannot clear highlightedBlockId
      // (internal-boundary draw stays on Blocks with the source paddock selected).
      if (
        getCurrentDrawHandler()?._enabled ||
        boundaryEditRef.current ||
        internalBoundaryDrawRef.current
      ) {
        if (e.originalEvent) e.originalEvent._stopped = true;
        return;
      }

      const mapping = layerMapRef.current[e.layer._leaflet_id];
      if (mapping && mapping.type === 'block') {
        // While placing a flag, a tap on the block drops the pin (don't toggle selection)
        if (placingFlag && mapMode === 'operate') {
          if (e.originalEvent) {
            e.originalEvent._stopped = true;
          }
          const latlng = e.latlng || (e.layer?.getBounds?.().getCenter?.());
          if (latlng) {
            setReportDraft({
              lat: latlng.lat,
              lng: latlng.lng,
              blockId: mapping.id,
            });
            setPlacingFlag(false);
            setIssuesPanelBlockId(null);
            setSelectedIssue(null);
            setHighlightedBlockId(mapping.id);
          }
          return;
        }

        // Infra / tracks edit: ignore paddock hits so placement isn't hijacked
        if (
          mapMode === 'edit' &&
          activeTabRef.current !== 'blocks' &&
          activeTabRef.current !== 'analytics'
        ) {
          return;
        }

        // Stop propagation to prevent map click from clearing highlight
        if (e.originalEvent) {
          e.originalEvent._stopped = true;
        }

        // Toggle: same block again closes the popup / clears selection
        const next =
          highlightedBlockIdRef.current === mapping.id ? null : mapping.id;
        setHighlightedBlockId(next);
        if (next && mapMode === 'edit') {
          setActiveTab('blocks');
          setShowSidebar(true);
        } else if (mapMode !== 'edit') {
          setShowSidebar(false);
        }
      } else if (mapping && mapping.type === 'track') {
        // Only jump to Tracks when that tab is active (or operate has no track UX)
        if (mapMode === 'edit' && activeTabRef.current !== 'tracks') {
          return;
        }
        if (e.originalEvent) {
          e.originalEvent._stopped = true;
        }
        const next =
          highlightedTrackIdRef.current === mapping.id ? null : mapping.id;
        setHighlightedTrackId(next);
        if (next && mapMode === 'edit') {
          setActiveTab('tracks');
          setShowSidebar(true);
          setEditingTrackId(next);
        }
      } else if (mapping && mapping.type === 'pin') {
        if (mapMode !== 'edit' || activeTabRef.current !== 'infrastructure') return;
        if (e.originalEvent) {
          e.originalEvent._stopped = true;
        }
        setEditingPinId(mapping.id);
        setShowSidebar(true);
      }
    };

    fg.on('click', handleLayerClick);
    return () => {
      fg.off('click', handleLayerClick);
    };
  }, [mapInstance, isLoaded, mapMode, placingFlag]);

  // Scroll highlighted block into view
  useEffect(() => {
    if (highlightedBlockId) {
      const prefix = activeTab === 'analytics' ? 'analytics-' : '';
      const element = document.getElementById(`${prefix}block-item-${highlightedBlockId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [highlightedBlockId, activeTab]);

  // Fetch harvests
  useEffect(() => {
    if (!farmId) return;
    if (isLocalOnlyFarmSession()) {
      setHarvests([]);
      return;
    }
    const fetchHarvests = async () => {
      try {
        const q = query(collection(db, 'farms', farmId, 'harvests'), orderBy('date', 'desc'));
        const snapshot = await getDocs(q);
        setHarvests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error("Error fetching harvests:", error);
      }
    };
    fetchHarvests();
  }, [farmId]);

  // Weather for Edit → Analytics heatmaps only
  useEffect(() => {
    if (mapMode === 'edit' && activeTab === 'analytics' && !environmentalData && !isWeatherLoading && farmId) {
      setIsWeatherLoading(true);
      const start = new Date();
      start.setDate(start.getDate() - 14);
      const end = new Date();
      end.setDate(end.getDate() + 14);
      
      fetchEnvironmentalData(
        farmId || '', 
        'DPIRD', 
        start, 
        end, 
        viewport.lat, 
        viewport.lng, 
        undefined, 
        blocks, 
        getSprayEvents(), 
        getIrrigationEvents(), 
        undefined, 
        settings?.irrigationSystemType || 'micro'
      )
        .then(data => {
          setEnvironmentalData(data);
          setIsWeatherLoading(false);
        })
        .catch(err => {
          console.error("Failed to fetch environmental data", err);
          setIsWeatherLoading(false);
        });
    }
  }, [mapMode, activeTab, environmentalData, isWeatherLoading, viewport.lat, viewport.lng, farmId]);

  const getPinIcon = useCallback((pin: InfrastructurePin) => {
    const def = getInfraType(pin.type);
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
    let colorClass = 'text-slate-500 bg-slate-100 border-slate-300';
    
    if (pin.type === 'weather') {
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>`;
      colorClass = 'text-blue-600 bg-blue-50 border-blue-200';
    } else if (pin.type === 'soil') {
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/></svg>`;
      colorClass = 'text-amber-600 bg-amber-50 border-amber-200';
    } else if (pin.type === 'irrigation' || pin.type === 'standpipe') {
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7 2.9 7 2.9s-2.29 6.16-2.29 6.16c-1.14.93-1.71 2.03-1.71 3.19 0 2.22 1.8 4.05 4 4.05z"/></svg>`;
      colorClass = 'text-cyan-600 bg-cyan-50 border-cyan-200';
    } else if (pin.type === 'vehicle') {
      colorClass = 'text-indigo-600 bg-indigo-50 border-indigo-200';
    } else if (pin.type === 'fuel') {
      colorClass = 'text-amber-800 bg-amber-50 border-amber-300';
    } else if (pin.type === 'hazard') {
      colorClass = 'text-rose-600 bg-rose-50 border-rose-200';
    } else if (def) {
      colorClass = 'text-sky-700 bg-sky-50 border-sky-200';
    }

    return L.divIcon({
      html: `<div class="w-8 h-8 rounded-full border-2 flex items-center justify-center shadow-md ${colorClass}">${svg}</div>
             ${pin.status === 'active' ? `<div class="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></div>` : 
               pin.status === 'warning' ? `<div class="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 border-2 border-white rounded-full"></div>` : 
               `<div class="absolute -top-1 -right-1 w-3 h-3 bg-slate-400 border-2 border-white rounded-full"></div>`}`,
      className: 'custom-pin-icon bg-transparent border-0 relative',
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });
  }, []);

  const getPinTooltip = useCallback((pin: InfrastructurePin) => {
    const label = getInfraType(pin.type)?.label || pin.type || 'Unassigned';
    return `
      <div class="font-sans">
        <div class="font-bold text-sm">${pin.name || 'Unnamed asset'}</div>
        <div class="text-xs text-slate-500">${label} • ${pin.status}</div>
      </div>
    `;
  }, []);

  // Track viewport changes
  useEffect(() => {
    if (!mapInstance) return;
    
    // Phase 3.2: Viewport-based querying for OrchardMap
    const handleMoveEnd = debounce(() => {
      const center = mapInstance.getCenter();
      const bounds = mapInstance.getBounds();
      
      setViewport({ lat: center.lat, lng: center.lng, zoom: mapInstance.getZoom() });
      
      setBounds({
        minLat: bounds.getSouth(),
        maxLat: bounds.getNorth(),
        minLng: bounds.getWest(),
        maxLng: bounds.getEast()
      });
    }, 500);

    mapInstance.on('moveend', handleMoveEnd);
    mapInstance.on('zoomend', handleMoveEnd);
    
    return () => {
      mapInstance.off('moveend', handleMoveEnd);
      mapInstance.off('zoomend', handleMoveEnd);
    };
  }, [mapInstance, setViewport, setBounds]);

  // Pattern defs must outlive React commits (see ensureInfraFillPatterns).
  useEffect(() => {
    ensureInfraFillPatterns();
  }, []);

  // Keep Leaflet layers in sync with store (re-runs when EditControl mounts/clears the group)
  useEffect(() => {
    if (!isLoaded || !mapInstance) return;
    ensureInfraFillPatterns();

    const normalizeGeojson = (raw: unknown): any | null => {
      const parsed = parsePossiblyStringifiedGeojson(raw);
      if (!parsed) return null;
      // Prefer a Turf-normalized Polygon/MultiPolygon Feature (imported FC / string OK).
      return asFeature(parsed) || parsed;
    };

    const syncLayers = () => {
      const fg = featureGroupRef.current;
      if (!fg) return;
      let membershipChanged = false;
      ensureInfraFillPatterns();

      // Drop stale leaflet-id mappings after EditControl clears the group
      const liveIds = new Set(
        (fg.getLayers() as L.Layer[]).map((layer) => (layer as any)._leaflet_id as number)
      );
      for (const idStr of Object.keys(layerMapRef.current)) {
        const id = Number(idStr);
        if (!liveIds.has(id)) delete layerMapRef.current[id];
      }

      const existing = new Map<string, L.Layer>();
      for (const layer of fg.getLayers() as L.Layer[]) {
        const mapping = layerMapRef.current[(layer as any)._leaflet_id];
        if (mapping) existing.set(`${mapping.type}:${mapping.id}`, layer);
      }

      const wanted = new Set<string>();

      for (const block of blocks) {
        const key = `block:${block.id}`;
        wanted.add(key);
        if (existing.has(key)) continue;
        const geo = normalizeGeojson(block.geojson);
        if (!geo) continue;
        try {
          const layer = L.geoJSON(geo).getLayers()[0] as L.Layer | undefined;
          if (!layer) continue;
          fg.addLayer(layer);
          layerMapRef.current[(layer as any)._leaflet_id] = { type: 'block', id: block.id };
          membershipChanged = true;
        } catch (err) {
          console.warn('[OrchardMap] Failed to add block layer', block.id, err);
        }
      }

      for (const pin of pins) {
        const key = `pin:${pin.id}`;
        wanted.add(key);
        const draw = infraDrawMode(pin.type);
        const def = getInfraType(pin.type);
        const wantsGeo = !!(pin.geojson && (draw === 'polygon' || draw === 'line'));
        const existingLayer = existing.get(key);
        if (existingLayer) {
          const isMarker = existingLayer instanceof L.Marker;
          const onMap = typeof fg.hasLayer === 'function' ? fg.hasLayer(existingLayer) : true;
          // Recreate when missing from FG, or draw mode / geojson no longer matches layer kind.
          if (!onMap || wantsGeo === isMarker) {
            if (onMap) {
              fg.removeLayer(existingLayer);
              delete layerMapRef.current[(existingLayer as any)._leaflet_id];
            }
            existing.delete(key);
            membershipChanged = true;
          } else {
            // Keep membership; refresh polygon fill so hazards/pads/dams stay painted
            // after draw finish / pattern-def lifecycle (do not wait for a tab switch).
            if (wantsGeo && draw === 'polygon' && existingLayer instanceof L.Polygon) {
              applyInfraPolygonPattern(existingLayer, pin.type);
            }
            continue;
          }
        }
        let layer: L.Layer | undefined;
        if (wantsGeo) {
          try {
            const geo = typeof pin.geojson === 'string' ? JSON.parse(pin.geojson as string) : pin.geojson;
            const polyStyle =
              draw === 'polygon'
                ? infraPolygonPathStyle(pin.type)
                : {
                    color: def?.color || '#0284c7',
                    weight: 4,
                    fillColor: def?.color || '#0284c7',
                    fillOpacity: 0,
                  };
            layer = L.geoJSON(geo as GeoJSON.GeoJsonObject, {
              style: polyStyle,
            }).getLayers()[0] as L.Layer | undefined;
            if (layer && draw === 'polygon' && layer instanceof L.Polygon) {
              applyInfraPolygonPattern(layer, pin.type);
            }
          } catch (err) {
            console.warn('[OrchardMap] Failed to add infra geometry', pin.id, err);
          }
        }
        if (!layer) {
          const marker = L.marker([pin.lat, pin.lng]);
          marker.setIcon(getPinIcon(pin));
          layer = marker;
        }
        layer.bindTooltip(getPinTooltip(pin), {
          direction: 'top',
          offset: [0, -32],
          className: 'custom-tooltip',
        });
        fg.addLayer(layer);
        layerMapRef.current[(layer as any)._leaflet_id] = { type: 'pin', id: pin.id };
        membershipChanged = true;
      }

      for (const track of tracks) {
        const key = `track:${track.id}`;
        wanted.add(key);
        const geo = normalizeGeojson(track.geojson);
        if (!geo) continue;
        const existingLayer = existing.get(key);
        if (existingLayer) {
          // Keep layer identity; refresh geometry when the store track moves
          try {
            if (
              existingLayer instanceof L.Polyline &&
              !(existingLayer instanceof L.Polygon)
            ) {
              const fresh = L.geoJSON(geo).getLayers()[0] as L.Polyline | undefined;
              if (fresh && typeof fresh.getLatLngs === 'function') {
                existingLayer.setLatLngs(fresh.getLatLngs() as L.LatLng[]);
              }
            }
          } catch (err) {
            console.warn('[OrchardMap] Failed to update track layer', track.id, err);
          }
          continue;
        }
        try {
          const style = trackPathStyle(track.category, {
            highlighted: track.id === highlightedTrackIdRef.current,
          });
          const layer = L.geoJSON(geo, {
            style: {
              color: style.color,
              weight: style.weight,
              opacity: style.opacity,
              dashArray: style.dashArray,
              className: style.className,
            },
          }).getLayers()[0] as L.Layer | undefined;
          if (!layer) continue;
          fg.addLayer(layer);
          layerMapRef.current[(layer as any)._leaflet_id] = { type: 'track', id: track.id };
          membershipChanged = true;
        } catch (err) {
          console.warn('[OrchardMap] Failed to add track layer', track.id, err);
        }
      }

      for (const [key, layer] of existing) {
        if (wanted.has(key)) continue;
        fg.removeLayer(layer);
        delete layerMapRef.current[(layer as any)._leaflet_id];
        membershipChanged = true;
      }

      if (membershipChanged) {
        setForceRender((prev) => prev + 1);
      }
    };

    let cancelled = false;
    const run = () => {
      if (!cancelled) syncLayers();
    };
    run();
    // EditControl mount can clear FeatureGroup after first paint — one rAF + one short retry
    const raf = window.requestAnimationFrame(run);
    const t1 = window.setTimeout(run, 100);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t1);
    };
  }, [isLoaded, blocks, pins, tracks, mapInstance, mapMode, activeTab, getPinIcon, getPinTooltip]);

  // Let draw tools receive taps over paddocks when placing infra / tracks
  // (and when drawing an internal hazard/pad from Blocks — same tab would
  // otherwise keep paddock polygons interactive and steal tap-to-vertex).
  // CSS class survives highlight setStyle; JS walk covers nested GeoJSON groups.
  useEffect(() => {
    const fg = featureGroupRef.current;
    if (!fg) return;
    const passBlocksThrough =
      mapMode === 'edit' &&
      ((activeTab !== 'blocks' && activeTab !== 'analytics') ||
        Boolean(internalBoundaryDrawing));
    const passTracksThrough =
      mapMode === 'edit' && activeTab !== 'tracks';

    if (mapInstance) {
      mapInstance.getContainer().classList.toggle('pufom-draw-over-paddocks', passBlocksThrough);
    }

    const applyPassThrough = (layer: L.Layer, passThrough: boolean) => {
      if ('options' in layer && layer.options) {
        (layer.options as { interactive?: boolean }).interactive = !passThrough;
      }
      const el = (layer as L.Path).getElement?.() as HTMLElement | undefined;
      if (el?.style) {
        el.style.pointerEvents = passThrough ? 'none' : '';
      }
      const group = layer as L.LayerGroup;
      if (typeof group.eachLayer === 'function') {
        group.eachLayer((child) => applyPassThrough(child, passThrough));
      }
    };

    for (const layer of fg.getLayers() as L.Layer[]) {
      const mapping = layerMapRef.current[(layer as any)._leaflet_id];
      if (!mapping) continue;
      let passThrough = false;
      if (mapping.type === 'block') passThrough = passBlocksThrough;
      else if (mapping.type === 'track') passThrough = passTracksThrough;
      else continue;
      applyPassThrough(layer, passThrough);
    }

    return () => {
      mapInstance?.getContainer().classList.remove('pufom-draw-over-paddocks');
    };
  }, [
    mapMode,
    activeTab,
    forceRender,
    blocks,
    tracks,
    isLoaded,
    internalBoundaryDrawing,
    mapInstance,
    highlightedBlockId,
  ]);

  useEffect(() => {
    if (!featureGroupRef.current) return;
    const layers = featureGroupRef.current.getLayers();
    layers.forEach((layer: any) => {
      // Markers only — polygon/line infra pins have no setIcon.
      if (layer instanceof L.Marker && typeof layer.setIcon === 'function') {
        const mapping = layerMapRef.current[(layer as any)._leaflet_id];
        if (!mapping || mapping.type !== 'pin') return;
        const pin = pins.find(p => p.id === mapping.id);
        
        if (pin) {
          layer.setIcon(getPinIcon(pin));
          layer.bindTooltip(getPinTooltip(pin), { direction: 'top', offset: [0, -32], className: 'custom-tooltip' });
        }
      } else if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
        const mapping = layerMapRef.current[(layer as any)._leaflet_id];
        if (!mapping) return;
        if (mapping.type === 'pin') {
          const pin = pins.find((p) => p.id === mapping.id);
          if (!pin) return;
          const def = getInfraType(pin.type);
          layer.setStyle({
            color: def?.color || '#0e7490',
            weight: 4,
          });
          layer.bindTooltip(getPinTooltip(pin), {
            direction: 'top',
            offset: [0, -8],
            className: 'custom-tooltip',
          });
          return;
        }
        if (mapping.type !== 'track') return;
        const track = tracks.find(t => t.id === mapping.id);
        
        if (track) {
          const isHighlighted = track.id === highlightedTrackId;
          const style = trackPathStyle(track.category, { highlighted: isHighlighted });
          layer.setStyle({
            color: style.color,
            weight: style.weight,
            opacity: style.opacity,
            dashArray: style.dashArray,
          });
          const el = layer.getElement?.() as SVGElement | undefined;
          if (el) {
            el.classList.remove('pufam-track-line', 'pufam-track-line--highlight');
            for (const c of style.className.split(/\s+/)) {
              if (c) el.classList.add(c);
            }
          }
        }
      } else if (layer instanceof L.Polygon) {
        const mapping = layerMapRef.current[(layer as any)._leaflet_id];
        if (!mapping || mapping.type !== 'pin') return;
        const pin = pins.find((p) => p.id === mapping.id);
        if (!pin) return;
        applyInfraPolygonPattern(layer, pin.type);
        layer.bindTooltip(getPinTooltip(pin), {
          direction: 'top',
          offset: [0, -8],
          className: 'custom-tooltip',
        });
      }
    });
  }, [pins, blocks, tracks, forceRender, getPinIcon, getPinTooltip, highlightedTrackId]);

  // Phase 4.2: Risk Heatmaps & Analytics (current day)
  const today = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const targetDate = today;
  const targetYear = targetDate.getFullYear();
  const targetMonth = String(targetDate.getMonth() + 1).padStart(2, '0');
  const targetDay = String(targetDate.getDate()).padStart(2, '0');
  const targetDateStr = `${targetYear}-${targetMonth}-${targetDay}`;

  const blockCenters = React.useMemo(() => {
    const centers: Record<string, [number, number]> = {};
    blocks.forEach(block => {
      if (block.geojson) {
        try {
          const center = turf.centerOfMass(block.geojson);
          centers[block.id] = [center.geometry.coordinates[1], center.geometry.coordinates[0]];
        } catch (e) {
          // fallback
        }
      }
    });
    return centers;
  }, [blocks]);

  const dailyEvents = React.useMemo(() => events.filter(e => e.date === targetDateStr), [events, targetDateStr]);

  const blockSprayEventsCache = React.useMemo(() => {
    const cache: Record<string, any> = {};
    blocks.forEach(block => {
      cache[block.id] = getSprayEvents(block.id);
    });
    return cache;
  }, [blocks, getSprayEvents]);

  // CRITICAL OPTIMIZATION: The core Blight Engine and Risk Heatmap calculator.
  // Memoized so it only recalculates when the target date or underlying data changes.
  // TODO: [Enterprise Scale] Move this heavy mathematical lifting to a Firebase Cloud Function.
  // The server should do the math and simply send the final, lightweight numbers to the user's screen.
  const blockAnalytics = React.useMemo(() => {
    const analytics: Record<string, { 
      blight: number, 
      moisture: number, 
      heat: number, 
      overall: string, 
      color: string, 
      hasProtection: boolean,
      yieldTotal: number,
      yieldPerHa: number,
      yieldColor: string,
      lastHarvestDate: string | null
    }> = {};
    
    const monthFloat = targetDate.getMonth() + targetDate.getDate() / 31;

    // Southern Hemisphere seasonal curves (0 to 1)
    const seasonalHeat = (Math.cos((monthFloat - 0.5) * Math.PI / 6) + 1) / 2; // Peak Jan
    const seasonalMoisture = (Math.cos((monthFloat - 6.5) * Math.PI / 6) + 1) / 2; // Peak Jul
    const seasonalBlight = (Math.cos((monthFloat - 9.5) * Math.PI / 6) + 1) / 2; // Peak Oct

    const getSmoothColor = (value: number, type: 'risk' | 'yield' = 'risk') => {
      const v = Math.max(0, Math.min(1, value));
      if (type === 'risk') {
        if (v < 0.5) {
          const pct = v * 2;
          const r = Math.round(16 + pct * (245 - 16));
          const g = Math.round(185 + pct * (158 - 185));
          const b = Math.round(129 + pct * (11 - 129));
          return `rgb(${r}, ${g}, ${b})`;
        } else {
          const pct = (v - 0.5) * 2;
          const r = Math.round(245 + pct * (239 - 245));
          const g = Math.round(158 + pct * (68 - 158));
          const b = Math.round(11 + pct * (68 - 11));
          return `rgb(${r}, ${g}, ${b})`;
        }
      } else {
        // Yield color: Blue (low) to Emerald (high)
        const r = Math.round(30 + v * (16 - 30));
        const g = Math.round(64 + v * (185 - 64));
        const b = Math.round(175 + v * (129 - 175));
        return `rgb(${r}, ${g}, ${b})`;
      }
    };

    blocks.forEach((block) => {
      // TRV (Tree Row Volume) Calculation
      // TRV is a critical metric in orchard management. It represents the volume of canopy per hectare.
      // Higher TRV means denser canopy, which increases blight risk (poor airflow) but decreases heat risk (more shade).
      const height = block.treeHeight || defaultCalibration.treeHeight;
      const width = block.canopyWidth || defaultCalibration.canopyWidth;
      const spacing = block.rowSpacing || defaultCalibration.rowSpacing;
      const coverage = Math.min(1, width / spacing);
      const trv = (height * width * 10000) / spacing;
      const trvNorm = Math.min(1, trv / 50000); // Normalize to 50k m3/ha

      // Base risks derived from physical block properties
      const heatBase = Math.max(0.2, 1 - coverage); // Less coverage = more exposed ground = higher heat reflection
      const moistureBase = block.irrigation === 'none' ? 0.8 : block.irrigation === 'flood' ? 0.5 : 0.2;

      let heatRisk = 0;
      let moistureRisk = 0;
      let blightRisk = 0;

      if (environmentalData?.weatherData) {
        if (environmentalData.blockRisks && environmentalData.blockRisks[block.id]) {
          const blockData = environmentalData.blockRisks[block.id];
          const dayData = blockData.find((d: any) => d.dateStr === targetDateStr);
          if (dayData) {
            blightRisk = dayData.threat;
          } else {
            const latestData = blockData[blockData.length - 1] || { threat: 0.1 };
            blightRisk = latestData.threat;
          }
        } else {
          blightRisk = seasonalBlight * 0.7 + trvNorm * 0.3;
        }

        const dailyWeather = environmentalData.weatherData[targetDateStr];
        if (dailyWeather) {
          const tempFactor = Math.max(0, Math.min(1, (dailyWeather.T - 25) / 10));
          heatRisk = heatBase * 0.4 + tempFactor * 0.6;
          const dryFactor = Math.max(0, Math.min(1, (100 - dailyWeather.RH) / 50));
          const rainRelief = Math.min(1, dailyWeather.R / 10);
          moistureRisk = Math.max(0, (moistureBase * 0.4 + dryFactor * 0.6) - rainRelief);
        } else {
          heatRisk = heatBase;
          moistureRisk = moistureBase;
        }
      } else {
        heatRisk = heatBase * 0.4 + seasonalHeat * 0.6;
        moistureRisk = moistureBase * 0.4 + seasonalMoisture * 0.6;
        blightRisk = seasonalBlight * 0.7 + trvNorm * 0.3;
      }

      const maxRisk = Math.max(blightRisk, moistureRisk, heatRisk);
      let overall = maxRisk > 0.7 ? 'high' : maxRisk > 0.4 ? 'medium' : 'low';
      const color = getSmoothColor(maxRisk, 'risk');

      let blockSprayEvents = blockSprayEventsCache[block.id];

      // Protection Window Calculation
      // We assume a standard 14-day efficacy window for most chemical/biological sprays.
      // If a spray occurred within the last 14 days relative to the target date, the block is protected.
      const hasProtection = blockSprayEvents && Object.keys(blockSprayEvents).some(dateStr => {
        const sprayDate = new Date(dateStr);
        const diffDays = (targetDate.getTime() - sprayDate.getTime()) / (1000 * 3600 * 24);
        return diffDays >= 0 && diffDays <= 14;
      });

      // Yield Calculations
      const blockHarvests = harvests.filter(h => h.blockId === block.id);
      const yieldTotal = blockHarvests.reduce((acc, h) => acc + h.totalWeight, 0);
      const yieldPerHa = block.areaHa ? yieldTotal / block.areaHa : 0;
      const lastHarvest = blockHarvests.length > 0 ? blockHarvests[0] : null;

      // Normalize yield for coloring (0 to 10 tons/ha as range)
      const yieldNorm = Math.min(1, yieldPerHa / 10000); // Assuming 10t/ha is high
      const yieldColor = getSmoothColor(yieldNorm, 'yield');

      analytics[block.id] = {
        blight: blightRisk,
        moisture: moistureRisk,
        heat: heatRisk,
        overall,
        color,
        hasProtection,
        yieldTotal,
        yieldPerHa,
        yieldColor,
        lastHarvestDate: lastHarvest ? lastHarvest.date : null
      };
    });

    return analytics;
  }, [blocks, harvests, environmentalData, blockSprayEventsCache, targetDateStr, targetDate]);

  useEffect(() => {
    if (!featureGroupRef.current) return;
    const layers = featureGroupRef.current.getLayers();
    layers.forEach((layer: any) => {
      if (layer instanceof L.Polygon) {
        const mapping = layerMapRef.current[(layer as any)._leaflet_id];
        if (!mapping || mapping.type !== 'block') return;
        const block = blocks.find(b => b.id === mapping.id);
        
        if (block) {
          const isHighlighted = block.id === highlightedBlockId;
          // Risk/yield heatmaps only in Edit → Analytics (operate map stays neutral)
          const showRiskHeat = mapMode === 'edit' && activeTab === 'analytics';
          const viewMode = analyticsView;
          if (showRiskHeat) {
            const data = blockAnalytics[block.id];
            if (data) {
              const activeColor = viewMode === 'risk' ? data.color : data.yieldColor;
              const borderColor = isHighlighted ? '#6366f1' : (data.hasProtection ? '#3b82f6' : activeColor);
              const borderWeight = isHighlighted ? 6 : (data.hasProtection ? 4 : 2);
              const dashArray = data.hasProtection ? '10 5' : '';
              
              layer.setStyle({ 
                color: borderColor, 
                fillColor: activeColor, 
                fillOpacity: isHighlighted ? 0.8 : 0.6, 
                weight: borderWeight,
                dashArray: dashArray,
                className: 'smooth-polygon-transition'
              });
              layer.unbindTooltip();
            }
          } else {
            layer.setStyle({ 
              color: isHighlighted ? '#6366f1' : '#4f46e5', 
              fillColor: isHighlighted ? '#6366f1' : '#4f46e5', 
              fillOpacity: isHighlighted ? 0.6 : 0.4, 
              weight: isHighlighted ? 5 : 3, 
              dashArray: '' 
            });
            layer.unbindTooltip();
          }
        }
      }
    });
  }, [mapMode, activeTab, analyticsView, blocks, blockAnalytics, forceRender, highlightedBlockId]);

  const defaultCenter = { lat: -33.9249, lng: 115.0750, zoom: 15 };

  const handleLocateMe = useCallback(() => {
    if (!mapInstance) return;
    if (userFix) {
      mapInstance.flyTo([userFix.lat, userFix.lng], Math.max(mapInstance.getZoom(), 17), {
        animate: true,
      });
      setFollowUser(true);
      return;
    }
    // No fix yet — ask the browser / tablet once, then follow when watch catches up
    mapInstance.locate({ setView: true, maxZoom: 17 });
    setFollowUser(true);
  }, [mapInstance, userFix]);

  // Stop follow when the operator pans/zooms away on purpose
  useEffect(() => {
    if (!mapInstance || !followUser) return;
    const stopFollow = () => setFollowUser(false);
    mapInstance.on('dragstart', stopFollow);
    return () => {
      mapInstance.off('dragstart', stopFollow);
    };
  }, [mapInstance, followUser]);

  const handleGoHome = useCallback(() => {
    if (!fitFarmInView({ animate: true }) && mapInstance) {
      mapInstance.flyTo([defaultCenter.lat, defaultCenter.lng], defaultCenter.zoom);
    }
  }, [fitFarmInView, mapInstance]);

  const flyToTrack = useCallback(
    (track: FarmTrack) => {
      if (!mapInstance || !track.geojson) return;
      try {
        const layer = L.geoJSON(track.geojson as any);
        const bounds = layer.getBounds();
        if (bounds.isValid()) {
          mapInstance.flyToBounds(bounds.pad(0.2), { maxZoom: 18, animate: true });
        }
      } catch (err) {
        console.error('Failed to fly to track', err);
      }
    },
    [mapInstance]
  );

  const debouncedUpdateTrackName = useMemo(
    () =>
      debounce((id: string, name: string) => {
        updateTrack(id, { name });
      }, 300),
    [updateTrack]
  );

  useEffect(() => {
    return () => {
      debouncedUpdateTrackName.cancel();
    };
  }, [debouncedUpdateTrackName]);

  const clearInternalBoundaryDraw = useCallback(() => {
    internalBoundaryDrawRef.current = null;
    setInternalBoundaryDrawing(null);
  }, []);

  // Cancel Quick Add drawers when leaving edit mode, switching tabs, or changing infra draw kind
  const drawContextRef = useRef({ activeTab, mapMode, infraDrawKind });
  useEffect(() => {
    const prev = drawContextRef.current;
    const changed =
      prev.activeTab !== activeTab ||
      prev.mapMode !== mapMode ||
      prev.infraDrawKind !== infraDrawKind;
    drawContextRef.current = { activeTab, mapMode, infraDrawKind };
    if (!changed) return;

    // Internal-boundary draw from block edit stays on Blocks — don't kill it when
    // infraDrawKind / unrelated context flaps. Leaving Blocks or Edit cancels it.
    if (internalBoundaryDrawRef.current) {
      if (activeTab !== 'blocks' || mapMode !== 'edit') {
        clearInternalBoundaryDraw();
        cancelActiveDrawer(activeDrawerRef);
        if (boundaryEditRef.current) {
          cancelBoundaryEdit(boundaryEditRef.current);
          boundaryEditRef.current = null;
          setBoundaryEditBlockId(null);
        }
      }
      return;
    }

    cancelActiveDrawer(activeDrawerRef);
    if (boundaryEditRef.current) {
      cancelBoundaryEdit(boundaryEditRef.current);
      boundaryEditRef.current = null;
      setBoundaryEditBlockId(null);
    }
  }, [activeTab, mapMode, infraDrawKind, clearInternalBoundaryDraw]);

  useEffect(() => {
    return () => {
      cancelActiveDrawer(activeDrawerRef);
      if (boundaryEditRef.current) {
        cancelBoundaryEdit(boundaryEditRef.current);
        boundaryEditRef.current = null;
      }
    };
  }, []);

  const beginBoundaryEdit = useCallback(
    (blockId: string) => {
      if (!mapInstance || !canEdit || mapMode !== 'edit' || !featureGroupRef.current) return;
      clearInternalBoundaryDraw();
      cancelActiveDrawer(activeDrawerRef);
      if (boundaryEditRef.current) {
        cancelBoundaryEdit(boundaryEditRef.current);
        boundaryEditRef.current = null;
      }

      const layers = featureGroupRef.current.getLayers() as L.Layer[];
      const layer = layers.find((l) => {
        const id = (l as unknown as { _leaflet_id?: number })._leaflet_id;
        if (id == null) return false;
        const mapping = layerMapRef.current[id];
        return mapping?.type === 'block' && mapping.id === blockId;
      }) as L.Polygon | undefined;

      if (!layer || typeof (layer as L.Polygon).getLatLngs !== 'function') {
        console.warn('[OrchardMap] No polygon layer for block', blockId);
        return;
      }

      setEditingBlockId(null);
      setIsConfirmingDeleteBlock(false);
      setHighlightedBlockId(blockId);
      setActiveTab('blocks');
      setShowSidebar(true);

      boundaryEditRef.current = startBoundaryEdit({
        map: mapInstance,
        polygon: layer,
        blockId,
        onChange: () => setBoundaryEditTick((t) => t + 1),
      });
      setBoundaryEditBlockId(blockId);
      setBoundaryEditTick((t) => t + 1);
    },
    [mapInstance, canEdit, mapMode, clearInternalBoundaryDraw]
  );

  const saveBoundaryEdit = useCallback(() => {
    const session = boundaryEditRef.current;
    if (!session) return;
    const { geojson } = commitBoundaryEdit(session);
    const areaHa = effectivePaddockAreaHa(geojson, subtractingExclusionPolygons(pins));
    boundaryEditRef.current = null;
    setBoundaryEditBlockId(null);
    void updateBlock(session.blockId, { geojson, areaHa });
  }, [updateBlock, pins]);

  // Keep paddock areaHa net of dams / impassable internal polygons (exterior stored intact).
  useEffect(() => {
    if (!isLoaded || !canEdit || !farmId) return;
    const updates = recomputeBlockAreasForFarm(blocks, pins);
    for (const u of updates) {
      void updateBlock(u.id, { areaHa: u.areaHa });
    }
  }, [isLoaded, canEdit, farmId, blocks, pins, updateBlock]);

  const cancelBoundaryEditUi = useCallback(() => {
    if (boundaryEditRef.current) {
      cancelBoundaryEdit(boundaryEditRef.current);
      boundaryEditRef.current = null;
    }
    setBoundaryEditBlockId(null);
  }, []);

  /**
   * From block edit: stay on Blocks tab, cancel vertex edit, start polygon draw
   * for passable pad or impassable hazard (creates InfrastructurePin on Finish).
   */
  const beginInternalBoundaryDraw = useCallback(
    (kind: InternalBoundaryKind, blockId: string) => {
      if (!mapInstance || !canEdit || mapMode !== 'edit') return;
      if (!(L as any).Draw) {
        console.error('Leaflet Draw not initialized');
        return;
      }

      // Avoid DRAWSTOP from this cancel clearing the pending draw we are about to arm.
      skipInternalDrawClearRef.current = true;
      cancelActiveDrawer(activeDrawerRef);
      if (boundaryEditRef.current) {
        cancelBoundaryEdit(boundaryEditRef.current);
        boundaryEditRef.current = null;
        setBoundaryEditBlockId(null);
      }

      setEditingBlockId(null);
      setIsConfirmingDeleteBlock(false);
      setEditingPinId(null);
      setActiveTab('blocks');
      setHighlightedBlockId(blockId);
      // Do not setInfraDrawKind — that effect cancels the active drawer.

      internalBoundaryDrawRef.current = { kind, blockId };
      setInternalBoundaryDrawing({ kind, blockId });

      const polyStyle = infraPolygonPathStyle(kind);
      try {
        startActiveDrawer(
          activeDrawerRef,
          new (L as any).Draw.Polygon(mapInstance, {
            shapeOptions: {
              color: polyStyle.color,
              fillColor: polyStyle.fillColor,
              fillOpacity: polyStyle.fillOpacity,
              weight: polyStyle.weight,
              className: polyStyle.className,
              dashArray: polyStyle.dashArray,
            },
          })
        );
        window.setTimeout(() => {
          skipInternalDrawClearRef.current = false;
        }, 0);
        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
          setShowSidebar(false);
        }
      } catch (err) {
        console.error('Failed to start internal boundary draw', err);
        skipInternalDrawClearRef.current = false;
        clearInternalBoundaryDraw();
        cancelActiveDrawer(activeDrawerRef);
      }
    },
    [mapInstance, canEdit, mapMode, clearInternalBoundaryDraw]
  );

  // Workflow: Add hazard → zoom → place point. Zoom/pinch must not leave the drawer
  // ignoring taps. Revive the same handler (keeps vertices); only recreate if missing.
  useEffect(() => {
    if (!mapInstance || !internalBoundaryDrawing || mapMode !== 'edit' || !canEdit) return;

    const revive = () => {
      if (!internalBoundaryDrawRef.current) return;
      clearDrawUiIgnoreWindow();
      if (reviveActiveDrawer(activeDrawerRef)) return;
      if (!(L as any).Draw) return;
      const { kind } = internalBoundaryDrawRef.current;
      const polyStyle = infraPolygonPathStyle(kind);
      try {
        startActiveDrawer(
          activeDrawerRef,
          new (L as any).Draw.Polygon(mapInstance, {
            shapeOptions: {
              color: polyStyle.color,
              fillColor: polyStyle.fillColor,
              fillOpacity: polyStyle.fillOpacity,
              weight: polyStyle.weight,
              className: polyStyle.className,
              dashArray: polyStyle.dashArray,
            },
          })
        );
      } catch (err) {
        console.warn('[OrchardMap] Failed to restore internal boundary draw after zoom', err);
      }
    };

    // Only on zoom — dragend keeps a short ignore window so pan doesn't drop a ghost point.
    mapInstance.on('zoomend', revive);
    const onZoomEndDelayed = () => {
      window.setTimeout(revive, 50);
      window.setTimeout(revive, 250);
    };
    mapInstance.on('zoomend', onZoomEndDelayed);

    return () => {
      mapInstance.off('zoomend', revive);
      mapInstance.off('zoomend', onZoomEndDelayed);
    };
  }, [mapInstance, internalBoundaryDrawing, mapMode, canEdit]);

  // Phase 5.1: Quick Add Tool Trigger
  const handleQuickAdd = useCallback(() => {
    if (!mapInstance || !canEdit || mapMode !== 'edit') return;
    if (boundaryEditRef.current) {
      cancelBoundaryEdit(boundaryEditRef.current);
      boundaryEditRef.current = null;
      setBoundaryEditBlockId(null);
    }
    // Plus draws a paddock / track / infra asset — not an internal-boundary shortcut.
    clearInternalBoundaryDraw();

    if (!(L as any).Draw) {
      console.error("Leaflet Draw not initialized");
      return;
    }

    try {
      if (activeTab === 'blocks') {
        startActiveDrawer(
          activeDrawerRef,
          new (L as any).Draw.Polygon(mapInstance, {
            shapeOptions: {
              color: '#4f46e5',
              fillOpacity: 0.4,
              weight: 3,
            },
          })
        );
      } else if (activeTab === 'tracks') {
        startActiveDrawer(
          activeDrawerRef,
          new (L as any).Draw.Polyline(mapInstance, {
            shapeOptions: {
              color: TRACK_COLOR_DRAW,
              weight: 5,
              opacity: 1,
              className: 'pufam-track-line',
            },
          })
        );
      } else if (activeTab === 'infrastructure') {
        const mode = infraDrawMode(infraDrawKind);
        const polyStyle = infraPolygonPathStyle(infraDrawKind);
        const color = polyStyle.color;
        if (mode === 'polygon') {
          startActiveDrawer(
            activeDrawerRef,
            new (L as any).Draw.Polygon(mapInstance, {
              shapeOptions: {
                color: polyStyle.color,
                fillColor: polyStyle.fillColor,
                fillOpacity: polyStyle.fillOpacity,
                weight: polyStyle.weight,
                className: polyStyle.className,
                dashArray: polyStyle.dashArray,
              },
            })
          );
        } else if (mode === 'line') {
          startActiveDrawer(
            activeDrawerRef,
            new (L as any).Draw.Polyline(mapInstance, {
              shapeOptions: { color, weight: 4 },
            })
          );
        } else {
          startActiveDrawer(activeDrawerRef, new (L as any).Draw.Marker(mapInstance));
        }
      } else {
        return;
      }
      // Mobile overlay sidebar covers the map — tuck it away so taps can place
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setShowSidebar(false);
      }
    } catch (err) {
      console.error("Failed to enable draw handler", err);
      cancelActiveDrawer(activeDrawerRef);
    }
  }, [mapInstance, activeTab, canEdit, mapMode, infraDrawKind, clearInternalBoundaryDraw]);

  // Phase 4.3: Geocoding Search
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim().toLowerCase();
    if (!query || !mapInstance) return;
    
    setIsSearching(true);
    try {
      // 1. Search Blocks
      const foundBlock = blocks.find(b => b.name?.toLowerCase().includes(query));
      if (foundBlock && foundBlock.geojson) {
        try {
          const center = turf.centerOfMass(foundBlock.geojson);
          mapInstance.flyTo([center.geometry.coordinates[1], center.geometry.coordinates[0]], 16);
          setHighlightedBlockId(foundBlock.id);
          setActiveTab('blocks');
          setSearchQuery('');
          return;
        } catch (e) {
          // fallback
        }
      }

      // 2. Search Tracks
      const foundTrack = tracks.find((t) => t.name?.toLowerCase().includes(query));
      if (foundTrack && foundTrack.geojson) {
        flyToTrack(foundTrack);
        setHighlightedTrackId(foundTrack.id);
        setActiveTab('tracks');
        if (mapMode === 'edit') {
          setEditingTrackId(foundTrack.id);
          setShowSidebar(true);
        }
        setSearchQuery('');
        return;
      }

      // 3. Search Infrastructure Pins
      const foundPin = pins.find(p => p.name?.toLowerCase().includes(query));
      if (foundPin) {
        mapInstance.flyTo([foundPin.lat, foundPin.lng], 18);
        setActiveTab('infrastructure');
        setSearchQuery('');
        return;
      }

      // 4. Fallback to Geocoding (Towns, etc.)
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        mapInstance.flyTo([parseFloat(lat), parseFloat(lon)], 14);
        setSearchQuery('');
      } else {
        console.error('Location not found. Try a different search term.');
      }
    } catch (err) {
      console.error('Search failed', err);
    } finally {
      setIsSearching(false);
    }
  };

  const tabs = [
    { id: 'blocks', name: mapCopy.blocksTab, icon: Layers, description: 'Draw and edit paddock boundaries' },
    { id: 'tracks', name: 'Tracks', icon: Route, description: 'Farm pathways & navigation' },
    { id: 'infrastructure', name: 'Infrastructure', icon: MapPin, description: 'Dams, pipes, sensors & pins' },
    { id: 'analytics', name: 'Analytics', icon: BarChart3, description: 'Risk heatmaps & yield view' },
  ];

  const openIssuesByBlock = useMemo(
    () => countOpenIssuesByBlock(blocks, fieldIssues),
    [blocks, fieldIssues]
  );

  const selectedOperateBlock = highlightedBlockId
    ? blocks.find((b) => b.id === highlightedBlockId) || null
    : null;

  const issuesPanelBlock = issuesPanelBlockId
    ? blocks.find((b) => b.id === issuesPanelBlockId) || null
    : null;

  const issuesForPanel = useMemo(
    () => (issuesPanelBlock ? issuesForBlock(issuesPanelBlock, fieldIssues) : []),
    [issuesPanelBlock, fieldIssues]
  );

  const startReportForBlock = useCallback(
    (block: OrchardBlock) => {
      setHighlightedBlockId(block.id);
      setIssuesPanelBlockId(null);
      setReportDraft(null);
      setSelectedIssue(null);
      setPlacingFlag(true);
      fitBlockInView(block);
    },
    [fitBlockInView]
  );

  const handleSaveIssue = useCallback(
    async (data: {
      category: FieldIssue['category'];
      priority: FieldIssue['priority'];
      note: string;
    }) => {
      if (!farmId || !reportDraft || !userData?.uid) return;
      const issue: FieldIssue = {
        id: crypto.randomUUID(),
        lat: reportDraft.lat,
        lng: reportDraft.lng,
        category: data.category,
        priority: data.priority,
        note: data.note || undefined,
        status: 'open',
        reportedBy: userData.uid,
        reportedAt: new Date().toISOString(),
      };
      await addFieldIssue(farmId, issue);
      setReportDraft(null);
      setShowIssueFlags(true);
    },
    [farmId, reportDraft, userData?.uid, addFieldIssue]
  );

  // Keep the dropped pin visible under the top issue menu
  useEffect(() => {
    if (!mapInstance || !reportDraft) return;
    mapInstance.panTo([reportDraft.lat, reportDraft.lng], { animate: true });
    // Nudge down so the pin sits in the open map below the top sheet
    window.setTimeout(() => {
      mapInstance.panBy([0, 90], { animate: true });
    }, 180);
  }, [mapInstance, reportDraft?.lat, reportDraft?.lng]);

  // Stock leaflet-draw toolbar is hidden (Plus / DrawingActionBar / Edit boundary only).
  // Keep EditControl mounted for draw:created; all toolbar tools stay disabled.
  const leafletDrawOptions = useMemo(
    () => ({
      rectangle: false,
      circle: false,
      circlemarker: false,
      polyline: false,
      marker: false,
      polygon: false,
    }),
    []
  );

  const leafletEditOptions = useMemo(
    () => ({
      // Boundary vertex edit is custom (Edit boundary); never expose stock edit/delete.
      edit: false,
      remove: false,
    }),
    []
  );

  const enterEditPaddocks = () => {
    setMapMode('edit');
    setActiveTab('blocks');
    setShowSidebar(true);
    setPlacingFlag(false);
    setReportDraft(null);
    setIssuesPanelBlockId(null);
  };

  const exitEditPaddocks = () => {
    setMapMode('operate');
    setEditingBlockId(null);
    setEditingPinId(null);
    setEditingTrackId(null);
    setShowSidebar(false);
  };

  if (!isLoaded || !basemapChecked) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!farmId) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-6 text-center text-slate-500 bg-slate-50">
        Sign in with a farm account to use the orchard map.
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-slate-900">
      {/* Compact toolbar */}
      <div className="shrink-0 z-20 bg-white border-b border-slate-200 px-2 sm:px-3 py-1.5">
        <div className="flex items-center gap-2 min-h-[36px]">
          {mapMode === 'edit' && (
            <button
              type="button"
              onClick={() => setShowSidebar(!showSidebar)}
              className="lg:hidden p-1.5 text-slate-600 rounded-lg hover:bg-slate-100"
              title="Edit tools"
              aria-label={showSidebar ? 'Close edit tools' : 'Open edit tools'}
            >
              {showSidebar ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          )}

          <h1 className="text-sm sm:text-base font-bold text-slate-900 whitespace-nowrap shrink-0">
            {mapMode === 'operate' ? mapCopy.mapTitle : mapCopy.editTitle}
          </h1>
          {farmId && userData?.uid && !isLocalOnlyFarmSession() && (
            <span
              className={cn(
                'inline-flex items-center gap-1 h-7 px-2 rounded-md text-[10px] font-semibold border',
                crewNearby > 0
                  ? 'bg-sky-50 text-sky-800 border-sky-100'
                  : crewPublishStatus === 'error'
                    ? 'bg-rose-50 text-rose-800 border-rose-100'
                    : crewPublishStatus === 'live'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                      : 'bg-slate-50 text-slate-600 border-slate-200'
              )}
              title={
                crewError ||
                (crewNearby > 0
                  ? 'Other farm members sharing live location'
                  : crewPublishStatus === 'no-gps'
                    ? 'You can still see others without GPS. Your marker only appears once this device has a fix (tablet/phone).'
                    : crewPublishStatus === 'off'
                      ? 'Turn on Settings → Privacy → Share location with farm crew (needed on the device that should be visible)'
                      : crewPublishStatus === 'live'
                        ? 'You are sharing live location with the farm'
                        : 'Crew presence — others appear here when they share + have GPS')
              }
            >
              <User className="w-3 h-3" />
              {crewNearby > 0
                ? `Crew · ${crewNearby} nearby`
                : crewPublishStatus === 'off'
                  ? 'Crew off'
                  : crewPublishStatus === 'no-gps'
                    ? 'Crew · watching'
                    : crewPublishStatus === 'error'
                      ? 'Crew · error'
                      : crewSharing
                        ? 'Crew · sharing'
                        : 'Crew'}
            </span>
          )}
          {pendingSyncCount > 0 && farmId && (
            <button
              type="button"
              onClick={() => void flushSync(farmId)}
              className="hidden sm:inline-flex items-center gap-1 h-7 px-2 rounded-md bg-amber-50 text-amber-800 text-[10px] font-semibold hover:bg-amber-100"
              title="Retry uploading queued map changes to the farm cloud"
            >
              <RefreshCw className="w-3 h-3" />
              {pendingSyncCount} pending sync
            </button>
          )}

          <form
            onSubmit={handleSearch}
            className="flex-1 min-w-0 max-w-xs sm:max-w-sm flex items-center h-8 rounded-lg border border-slate-200 bg-slate-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500/40 overflow-hidden"
          >
            <Search className="w-3.5 h-3.5 text-slate-400 ml-2 shrink-0" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search location…"
              className="flex-1 min-w-0 px-2 py-1 bg-transparent text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 border-none outline-none"
            />
            {isSearching && <Loader2 className="w-3.5 h-3.5 text-slate-400 mr-2 animate-spin shrink-0" />}
          </form>

          <div className="flex items-center gap-1 ml-auto shrink-0">
            {basemapPack ? (
              <>
                <span
                  className="hidden md:inline-flex items-center gap-1 h-8 px-2 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] font-medium max-w-[140px]"
                  title={`${basemapPack.label} · ${basemapPack.tileCount.toLocaleString()} tiles`}
                >
                  <HardDrive className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    Offline {formatPackBytes(basemapPack.bytes)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => openBasemapSetup(true)}
                  disabled={basemapBusy}
                  className="inline-flex items-center gap-1 h-8 px-2 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-semibold hover:bg-emerald-100 disabled:opacity-50"
                  title="Re-download farm satellite map"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', basemapBusy && 'animate-spin')} />
                  <span className="hidden sm:inline">Update</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleClearBasemap()}
                  disabled={basemapBusy}
                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg disabled:opacity-50"
                  title="Clear local offline map"
                  aria-label="Clear local offline map"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => openBasemapSetup(true)}
                className="inline-flex items-center gap-1 h-8 px-2 rounded-lg bg-amber-50 text-amber-800 text-[11px] font-semibold hover:bg-amber-100"
                title="Download satellite imagery for offline use"
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {basemapSkipped ? 'Save offline map' : 'Save offline map'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowHelp(true)}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
              title="Help"
              aria-label="Help"
            >
              <CircleHelp className="w-4 h-4" />
            </button>

            {mapMode === 'edit' ? (
              <button
                type="button"
                onClick={exitEditPaddocks}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Map</span>
              </button>
            ) : (
              canEdit && (
                <button
                  type="button"
                  onClick={enterEditPaddocks}
                  className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
                  title={mapCopy.editTitle}
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Edit</span>
                </button>
              )
            )}
          </div>
        </div>

        {mapMode === 'edit' && (
          <nav className="flex gap-1 mt-1.5 overflow-x-auto pb-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id as SubTab);
                  // Keep the management panel open so type pickers / lists stay reachable
                  setShowSidebar(true);
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors',
                  activeTab === tab.id
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                )}
              >
                <tab.icon className="w-3 h-3" />
                {tab.name}
              </button>
            ))}
          </nav>
        )}
      </div>

      {syncError && (
        <div className="shrink-0 z-20 flex items-start gap-2 px-3 py-2 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="flex-1 min-w-0 leading-snug">{syncError}</p>
          {farmId && pendingSyncCount > 0 && (
            <button
              type="button"
              onClick={() => void flushSync(farmId)}
              className="shrink-0 font-semibold underline underline-offset-2"
            >
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={() => clearSyncError()}
            className="shrink-0 p-0.5 rounded hover:bg-amber-100"
            aria-label="Dismiss sync warning"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Mobile Sidebar Backdrop */}
        <AnimatePresence>
          {mapMode === 'edit' && showSidebar && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSidebar(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[1000] lg:hidden"
            />
          )}
        </AnimatePresence>

        {/* Left Sidebar - Edit paddocks only (scrolls independently; does not grow the map) */}
        {mapMode === 'edit' && (
        <div className={`
          fixed lg:static inset-y-0 left-0 z-[1001] lg:z-auto lg:inset-auto
          w-72 sm:w-80 lg:h-full lg:min-h-0 lg:max-h-full shrink-0
          bg-white border-r border-slate-200 flex flex-col shadow-xl lg:shadow-none overflow-hidden
          transition-transform duration-300 ease-in-out
          ${showSidebar ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          <div className="shrink-0 border-b border-slate-100 bg-slate-50/50">
            <div className="p-3 sm:p-4 pb-2 flex items-center justify-between gap-2">
              <h2 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                {tabs.find(t => t.id === activeTab)?.name} Management
              </h2>
              <div className="flex gap-2 shrink-0">
                {activeTab === 'infrastructure' && (
                  <button 
                    onClick={() => setShowCoverage(!showCoverage)}
                    className={`p-1.5 rounded-lg transition-colors ${showCoverage ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                    title="Toggle Coverage Zones"
                  >
                    <Radio className="w-4 h-4" />
                  </button>
                )}
                {activeTab === 'blocks' && canEdit && mapMode === 'edit' && (
                  <button
                    type="button"
                    onClick={() => setShowBoundaryImport(true)}
                    className="p-1.5 rounded-lg transition-colors bg-slate-200 text-slate-700 hover:bg-slate-300"
                    title="Import boundaries (ISOXML / KML)"
                  >
                    <FileUp className="w-4 h-4" />
                  </button>
                )}
                {activeTab !== 'analytics' && (
                  <button 
                    onClick={handleQuickAdd}
                    className={`p-1.5 rounded-lg transition-colors ${canEdit ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                    title={
                      activeTab === 'infrastructure'
                        ? (() => {
                            const def = getInfraType(infraDrawKind);
                            const mode = def?.draw || 'point';
                            const verb =
                              mode === 'polygon' ? 'Draw' : mode === 'line' ? 'Draw' : 'Add';
                            return `${verb} ${def?.shortLabel || 'asset'}`;
                          })()
                        : activeTab === 'tracks'
                          ? 'Draw Track'
                          : `Draw ${mapCopy.blockWord.charAt(0).toUpperCase()}${mapCopy.blockWord.slice(1)}`
                    }
                    disabled={!canEdit || Boolean(boundaryEditBlockId)}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
                <button 
                  onClick={() => setShowSidebar(false)}
                  className="lg:hidden p-1.5 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <nav className="flex gap-1 px-3 sm:px-4 pb-3 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={`sidebar-${tab.id}`}
                  type="button"
                  onClick={() => setActiveTab(tab.id as SubTab)}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors',
                    activeTab === tab.id
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                  )}
                  title={tab.description}
                >
                  <tab.icon className="w-3 h-3" />
                  {tab.name}
                </button>
              ))}
            </nav>
          </div>
          
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4">
            {activeTab === 'blocks' && blocks.length > 0 ? (
              <div className="space-y-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex justify-between items-center mb-4">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Area</div>
                  <div className="font-bold text-indigo-600">{blocks.reduce((sum, b) => sum + (b.areaHa || 0), 0).toFixed(2)} ha</div>
                </div>
                {blocks.map(block => (
                  <div 
                    key={block.id} 
                    id={`block-item-${block.id}`}
                    onClick={() => {
                      setEditingBlockId(block.id);
                      setHighlightedBlockId(block.id);
                    }}
                    className={cn(
                      "p-3 border rounded-xl hover:shadow-md transition-all cursor-pointer bg-white group",
                      highlightedBlockId === block.id 
                        ? "border-indigo-500 ring-2 ring-indigo-500/20 shadow-md" 
                        : "border-slate-200 hover:border-indigo-400"
                    )}
                  >
                    <div className="flex justify-between items-start mb-1 gap-2">
                      <div className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors min-w-0">
                        {block.name || `Unnamed ${areaWordForCropKind(block.cropKind)}`}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {block.cropKind && (
                          <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            {getEnterprise(block.cropKind as FarmEnterpriseId).shortLabel}
                          </span>
                        )}
                        {block.areaHa !== undefined && (
                          <div className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                            {block.areaHa} ha
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 flex flex-col gap-1">
                      {isTreeCropKind(block.cropKind) ? (
                        <>
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="font-medium text-slate-600">Species:</span>{' '}
                            {block.species || '—'}
                            <span className="text-slate-300 mx-1">·</span>
                            <span className="font-medium text-slate-600">Cultivar:</span>{' '}
                            {block.cultivar || 'Not set'}
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-slate-600">Spacing:</span>{' '}
                            {block.rowSpacing && block.treeSpacing
                              ? `${block.rowSpacing}m x ${block.treeSpacing}m`
                              : 'Not set'}
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-slate-600">Density:</span>{' '}
                            {block.density ? `${block.density} trees/ha` : 'Not set'}
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-slate-600">TRV:</span>{' '}
                            {block.treeHeight && block.canopyWidth && block.rowSpacing
                              ? `${Math.round((block.treeHeight * block.canopyWidth * 10000) / block.rowSpacing).toLocaleString()} m³/ha`
                              : 'Not set'}
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-slate-600">Crop Coefficient (Kc):</span>{' '}
                            {block.canopyWidth && block.rowSpacing
                              ? (0.2 + 0.8 * Math.min(1, block.canopyWidth / block.rowSpacing)).toFixed(2)
                              : 'Not set'}
                          </div>
                          {block.density && block.areaHa !== undefined && (
                            <div className="mt-2 pt-2 border-t border-slate-100 grid grid-cols-2 gap-2">
                              <div className="flex flex-col">
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                  Est. Trees
                                </span>
                                <span className="font-medium text-indigo-600">
                                  {Math.round(block.areaHa * parseInt(block.density, 10)).toLocaleString()}
                                </span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                  Est. Yield
                                </span>
                                <span className="font-medium text-emerald-600">
                                  {Math.round((block.areaHa * parseInt(block.density, 10) * 25) / 1000).toLocaleString()} t
                                </span>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div>
                            <span className="font-medium text-slate-600">
                              {block.cropKind
                                ? getEnterprise(block.cropKind as FarmEnterpriseId).varietyLabel
                                : 'Crop'}
                              :
                            </span>{' '}
                            {block.seasonLabel || block.cultivar || 'Not set yet'}
                          </div>
                          {block.irrigation ? (
                            <div>
                              <span className="font-medium text-slate-600">Irrigation:</span> {block.irrigation}
                            </div>
                          ) : null}
                        </>
                      )}
                      {(() => {
                        const internals = internalBoundariesIntersectingBlock(block, pins);
                        if (internals.length === 0 && highlightedBlockId !== block.id) return null;
                        return (
                          <div
                            className="mt-2 pt-2 border-t border-slate-100 space-y-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                              Internal boundaries
                              {internals.length > 0 ? ` · ${internals.length}` : ''}
                            </div>
                            {internals.length > 0 ? (
                              <ul className="space-y-0.5">
                                {internals.map((pin) => (
                                  <li
                                    key={pin.id}
                                    className="text-[11px] text-slate-600 flex items-center justify-between gap-2"
                                  >
                                    <span className="truncate">{pin.name}</span>
                                    <span className="shrink-0 text-slate-400">
                                      {pin.type === 'internal_impassable' ? 'Impassable' : 'Passable'}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            {canEdit && highlightedBlockId === block.id ? (
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    beginInternalBoundaryDraw('internal_passable', block.id)
                                  }
                                  className="flex-1 px-2 py-1 rounded-md bg-stone-100 text-stone-700 text-[10px] font-semibold hover:bg-stone-200"
                                >
                                  Add pad
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    beginInternalBoundaryDraw('internal_impassable', block.id)
                                  }
                                  className="flex-1 px-2 py-1 rounded-md bg-orange-50 text-orange-800 text-[10px] font-semibold hover:bg-orange-100"
                                >
                                  Add hazard
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            ) : activeTab === 'blocks' ? (
              <div className="p-4 border-2 border-dashed border-slate-200 rounded-xl text-center space-y-2">
                <p className="text-sm text-slate-500">No {mapCopy.blocksTab.toLowerCase()} defined yet.</p>
                <p className="text-xs text-slate-400">Start by drawing on the map.</p>
              </div>
            ) : null}

            {activeTab === 'infrastructure' ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Draw type
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {INFRA_TYPES.map((t) => {
                      const selected = infraDrawKind === t.id;
                      const modeHint =
                        t.draw === 'polygon' ? 'area' : t.draw === 'line' ? 'line' : 'pin';
                      const areaHint = infraSubtractsFromPaddock(t.id)
                        ? ' · cuts paddock area'
                        : t.id === 'internal_passable'
                          ? ' · keeps paddock area'
                          : '';
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setInfraDrawKind(t.id)}
                          title={`${t.label} — draw as ${modeHint}${areaHint}. ${t.blurb}`}
                          className={cn(
                            'px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors',
                            selected
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-700'
                          )}
                        >
                          {t.shortLabel}
                          <span
                            className={cn(
                              'ml-1 font-normal',
                              selected ? 'text-indigo-100' : 'text-slate-400'
                            )}
                          >
                            · {modeHint}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {pins.length > 0 ? (
                  pins.map((pin) => (
                    <div
                      key={pin.id}
                      onClick={() => setEditingPinId(pin.id)}
                      className="p-3 border border-slate-200 rounded-xl hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer bg-white group"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`w-2 h-2 shrink-0 rounded-full ${
                              pin.status === 'active'
                                ? 'bg-emerald-500 animate-pulse'
                                : pin.status === 'warning'
                                  ? 'bg-amber-500'
                                  : 'bg-slate-300'
                            }`}
                          />
                          <div className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors truncate">
                            {pin.name || 'Unnamed asset'}
                          </div>
                        </div>
                        <div className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md shrink-0 ml-2 max-w-[9rem] truncate" title={getInfraType(pin.type)?.label || pin.type || 'Unassigned'}>
                          {getInfraType(pin.type)?.label || pin.type || 'Unassigned'}
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
                      </div>

                      {/* Phase 3.3: Live Telemetry Mock — sensors only */}
                      {pin.status === 'active' &&
                        (pin.type === 'weather' ||
                          pin.type === 'soil' ||
                          pin.type === 'irrigation') && (
                          <div className="mt-2 pt-2 border-t border-slate-100 flex gap-4">
                            {pin.type === 'weather' && (
                              <>
                                <div className="flex flex-col">
                                  <span className="text-[9px] text-slate-400 uppercase font-semibold">
                                    Temp
                                  </span>
                                  <span className="text-xs font-medium text-slate-700">24.5°C</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[9px] text-slate-400 uppercase font-semibold">
                                    Humidity
                                  </span>
                                  <span className="text-xs font-medium text-slate-700">62%</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[9px] text-slate-400 uppercase font-semibold">
                                    Wind
                                  </span>
                                  <span className="text-xs font-medium text-slate-700">12 km/h</span>
                                </div>
                              </>
                            )}
                            {pin.type === 'soil' && (
                              <>
                                <div className="flex flex-col">
                                  <span className="text-[9px] text-slate-400 uppercase font-semibold">
                                    Moisture
                                  </span>
                                  <span className="text-xs font-medium text-slate-700">32% VWC</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[9px] text-slate-400 uppercase font-semibold">
                                    Temp
                                  </span>
                                  <span className="text-xs font-medium text-slate-700">18.2°C</span>
                                </div>
                              </>
                            )}
                            {pin.type === 'irrigation' && (
                              <>
                                <div className="flex flex-col">
                                  <span className="text-[9px] text-slate-400 uppercase font-semibold">
                                    Flow Rate
                                  </span>
                                  <span className="text-xs font-medium text-slate-700">45 L/h</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[9px] text-slate-400 uppercase font-semibold">
                                    Pressure
                                  </span>
                                  <span className="text-xs font-medium text-slate-700">2.1 bar</span>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                    </div>
                  ))
                ) : (
                  <div className="p-4 border-2 border-dashed border-slate-200 rounded-xl text-center space-y-2">
                    <p className="text-sm text-slate-500">No infrastructure defined yet.</p>
                    <p className="text-xs text-slate-400">
                      Pick a type above, then draw dams, pads, hazard zones, pipes, or place pins on the
                      map. Impassable areas and dams reduce paddock usable area; passable pads do not.
                    </p>
                  </div>
                )}
              </div>
            ) : null}

            {activeTab === 'tracks' && tracks.length > 0 ? (
              <div className="space-y-3">
                {tracks.map(track => (
                  <div 
                    key={track.id} 
                    onClick={() => {
                      setEditingTrackId(track.id);
                      setHighlightedTrackId(track.id);
                      flyToTrack(track);
                    }}
                    className={cn(
                      "p-3 border rounded-xl hover:shadow-md transition-all cursor-pointer bg-white group",
                      highlightedTrackId === track.id 
                        ? "border-indigo-500 ring-2 ring-indigo-500/20 shadow-md" 
                        : "border-slate-200 hover:border-indigo-400"
                    )}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <div className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                        {track.name || 'Unnamed Track'}
                      </div>
                      <div
                        className={cn(
                          'text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase border',
                          trackCategoryChipClass(track.category)
                        )}
                      >
                        {track.category}
                      </div>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <div className="text-xs text-slate-500">
                        Added {new Date(track.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : activeTab === 'tracks' ? (
              <div className="p-4 border-2 border-dashed border-slate-200 rounded-xl text-center space-y-2">
                <p className="text-sm text-slate-500">No tracks defined yet.</p>
                <p className="text-xs text-slate-400">
                  Use the <strong>+</strong> button or the polyline tool on the map to draw pathways.
                </p>
              </div>
            ) : null}

            {activeTab === 'analytics' && blocks.length > 0 ? (
              <div className="space-y-4">
                {/* View Toggle */}
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button 
                    onClick={() => setAnalyticsView('risk')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${analyticsView === 'risk' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    <Bug className="w-3.5 h-3.5" />
                    Risk
                  </button>
                  <button 
                    onClick={() => setAnalyticsView('yield')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${analyticsView === 'yield' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    <Weight className="w-3.5 h-3.5" />
                    Yield
                  </button>
                </div>

                {analyticsView === 'yield' && (
                  <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-4 text-white shadow-md">
                    <div className="text-indigo-100 text-xs font-semibold uppercase tracking-wider mb-1">Total Farm Yield</div>
                    <div className="flex items-end gap-2">
                      <div className="text-4xl font-bold">
                        {(harvests.reduce((acc, h) => acc + (h.totalWeight || 0), 0) / 1000).toFixed(1)} t
                      </div>
                      <div className="text-sm font-medium text-indigo-100 mb-1">Current Season</div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Block Status</h3>
                  <div className="space-y-2">
                    {blocks.map((block) => {
                      const data = blockAnalytics[block.id];
                      if (!data) return null;
                      
                      return (
                        <div 
                          key={block.id} 
                          id={`analytics-block-item-${block.id}`}
                          onClick={() => setHighlightedBlockId(block.id)}
                          className={cn(
                            "flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg border transition-colors cursor-pointer",
                            highlightedBlockId === block.id 
                              ? "border-indigo-500 bg-indigo-50/50" 
                              : "border-transparent hover:border-slate-100"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: analyticsView === 'risk' ? data.color : data.yieldColor }} />
                            <span className="text-sm font-medium text-slate-700">{block.name || 'Unnamed Block'}</span>
                            {data.hasProtection && analyticsView === 'risk' && (
                              <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                            )}
                          </div>
                          <span className="text-xs text-slate-500 font-mono">
                            {analyticsView === 'risk' ? `${data.overall} Risk` : `${(data.yieldPerHa / 1000).toFixed(1)} t/ha`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : activeTab === 'analytics' ? (
              <div className="p-4 border-2 border-dashed border-slate-200 rounded-xl text-center space-y-2">
                <p className="text-sm text-slate-500">No analytics available.</p>
                <p className="text-xs text-slate-400">Draw blocks to generate insights.</p>
              </div>
            ) : null}

          </div>
        </div>
        )}

        {/* Map Canvas */}
        {/* TODO: [Enterprise Scale] Map Rendering Limits (DOM Overload)
            Currently, we render every block (polygon), track (polyline), and event (marker) directly onto the Leaflet map.
            Leaflet uses SVG/DOM elements for these layers. If a commercial farm has 2,000 blocks and 500 daily event markers,
            the browser has to manage 2,500+ complex DOM nodes. On a mobile device, this will cause severe frame-rate drops,
            battery drain, and eventually crash the browser tab due to memory exhaustion.
            Fix: Implement Marker Clustering for pins/events, and transition to Vector Tiles or implement Bounding Box Queries
            (only loading and rendering the polygons that are currently visible within the user's screen coordinates).
        */}
        <div className="flex-1 min-h-0 bg-slate-900 relative overflow-hidden group">
          {showBasemapSetup && farmId && (
            <FarmBasemapSetup
              farmId={farmId}
              forceSetup={!basemapPack}
              onCancel={() => {
                if (!basemapPack) {
                  setBasemapSkipped(farmId, true);
                  setBasemapSkippedState(true);
                }
                setShowBasemapSetup(false);
              }}
              onComplete={async () => {
                await refreshBasemapPack();
                setShowBasemapSetup(false);
              }}
            />
          )}
          <MapContainer 
            center={[viewport.lat, viewport.lng]} 
            zoom={viewport.zoom} 
            maxZoom={20}
            zoomControl={false}
            scrollWheelZoom={true}
            wheelPxPerZoomLevel={120}
            wheelDebounceTime={40}
            zoomSnap={0}
            zoomDelta={0.5}
            className="absolute inset-0 z-0 orchard-map-leaflet pufom-hide-draw-toolbar"
            ref={setMapInstance}
          >
            {mapLayer === 'satellite' && basemapPack ? (
              <CachedTileLayer farmId={farmId} offlineOnly={!isOnline} />
            ) : useGoogleSatellite && googleMapsApiKey && mapLayer === 'satellite' ? (
              <GoogleMapsLayer
                type="hybrid"
                apiKey={googleMapsApiKey}
                onFail={() => setUseGoogleSatellite(false)}
              />
            ) : mapLayer === 'satellite' ? (
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution={ESRI_ATTRIBUTION}
                maxZoom={20}
                maxNativeZoom={19}
              />
            ) : (
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                attribution="&copy; <a href='https://carto.com/'>CARTO</a>"
              />
            )}
            {mapLayer === 'satellite' && !basemapPack && !(useGoogleSatellite && googleMapsApiKey) && (
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png"
                attribution="&copy; <a href='https://carto.com/'>CARTO</a>"
                zIndex={10}
              />
            )}
            {/* bottomright: topright is occupied by soft-key overlays (home / locate / flags) */}
            <ZoomControl position="bottomright" />
            
            <FeatureGroup ref={featureGroupRef}>
              {mapMode === 'edit' && canEdit && activeTab !== 'analytics' && !boundaryEditBlockId && (
                <StableEditControl
                  position="bottomleft"
                  onCreated={(e) => {
                  // Capture before cancelActiveDrawer / DRAWSTOP can race-clear the ref.
                  const pendingInternal = internalBoundaryDrawRef.current;
                  cancelActiveDrawer(activeDrawerRef);
                  const layer = e.layer;
                  const tab = activeTabRef.current;
                  const kind = infraDrawKindRef.current;
                  const id =
                    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                      ? crypto.randomUUID()
                      : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

                  const rejectLayer = (message: string) => {
                    alert(message);
                    try {
                      featureGroupRef.current?.removeLayer(layer);
                    } catch {
                      /* ignore */
                    }
                  };

                  if (e.layerType === 'polygon') {
                    const geojson = layer.toGeoJSON();

                    const saveInfraPolygon = (
                      pinKind: Exclude<InfraTypeId, ''>,
                      opts?: { relatedBlockId?: string; stayOnBlocksTab?: boolean }
                    ): boolean => {
                      if (!farmId) {
                        rejectLayer('Sign in to a farm before saving infrastructure.');
                        return false;
                      }
                      if (!canEdit) {
                        rejectLayer('Your role is view-only — ask a farm admin to grant edit access.');
                        return false;
                      }
                      if (infraDrawMode(pinKind) !== 'polygon') {
                        rejectLayer(
                          'Select Dam, Pad (passable), or Hazard zone / impassable before drawing an area.'
                        );
                        return false;
                      }

                      if (opts?.relatedBlockId && isInternalBoundaryType(pinKind)) {
                        try {
                          const related = blocks.find((b) => b.id === opts.relatedBlockId);
                          const blockGeo = related?.geojson
                            ? asFeature(related.geojson) || related.geojson
                            : null;
                          if (blockGeo && polygonMostlyOutsideBlock(geojson, blockGeo)) {
                            const ok = window.confirm(
                              'This shape is mostly outside the selected paddock. Save it anyway?'
                            );
                            if (!ok) {
                              rejectLayer('Internal boundary not saved.');
                              return false;
                            }
                          }
                        } catch (overlapErr) {
                          // Never abort create because imported geometry failed Turf checks.
                          console.warn(
                            '[OrchardMap] Internal-boundary outside-check failed; saving anyway',
                            overlapErr
                          );
                        }
                      }

                      layerMapRef.current[layer._leaflet_id] = { type: 'pin', id };
                      if (layer instanceof L.Polygon) {
                        ensureInfraFillPatterns();
                        applyInfraPolygonPattern(layer, pinKind);
                        // Re-paint after React commit so sibling hazard/pad fills stay bound
                        // to stable pattern defs (not destroyed by a re-render).
                        window.requestAnimationFrame(() => {
                          ensureInfraFillPatterns();
                          const fg = featureGroupRef.current;
                          if (!fg) return;
                          for (const ly of fg.getLayers() as L.Layer[]) {
                            const mapping = layerMapRef.current[(ly as any)._leaflet_id];
                            if (!mapping || mapping.type !== 'pin') continue;
                            if (!(ly instanceof L.Polygon)) continue;
                            const p = pinsRef.current.find((x) => x.id === mapping.id);
                            if (p && infraDrawMode(p.type) === 'polygon') {
                              applyInfraPolygonPattern(ly, p.type);
                            }
                          }
                        });
                      }
                      let lat = viewport.lat;
                      let lng = viewport.lng;
                      try {
                        const c = turf.centroid(geojson as GeoJSON.Feature);
                        lng = c.geometry.coordinates[0];
                        lat = c.geometry.coordinates[1];
                      } catch {
                        /* keep viewport */
                      }
                      const newPin: InfrastructurePin = {
                        id,
                        name: defaultInfraName(pinKind, pins.length + 1),
                        type: pinKind,
                        status: 'active',
                        lat,
                        lng,
                        geojson,
                      };
                      addPin(newPin);
                      setEditingPinId(id);
                      if (opts?.stayOnBlocksTab) {
                        setActiveTab('blocks');
                        if (opts.relatedBlockId) {
                          setHighlightedBlockId(opts.relatedBlockId);
                        }
                      } else {
                        setActiveTab('infrastructure');
                      }
                      setShowSidebar(true);
                      return true;
                    };

                    // Block-edit shortcut: pad / hazard — must win over paddock create.
                    if (pendingInternal) {
                      try {
                        const saved = saveInfraPolygon(pendingInternal.kind, {
                          relatedBlockId: pendingInternal.blockId,
                          stayOnBlocksTab: true,
                        });
                        if (saved) {
                          internalBoundaryDrawRef.current = null;
                          setInternalBoundaryDrawing(null);
                        }
                      } catch (err) {
                        console.error('Failed to save internal boundary after draw', err);
                        alert(
                          'Could not save that pad/hazard. Try Add hazard/pad again, then Finish with at least 3 points.'
                        );
                      }
                      return;
                    }

                    try {
                      // Infrastructure tab: polygon create uses selected area type (dam / internal).
                      if (tab === 'infrastructure') {
                        saveInfraPolygon(kind);
                        return;
                      }

                      // Blocks tab only — create paddock / orchard block (Plus entry point).
                      if (tab !== 'blocks') {
                        rejectLayer('Switch to Blocks to draw paddock boundaries.');
                        return;
                      }

                      // Usable area = exterior minus overlapping dams / impassable zones
                      const areaHa = effectivePaddockAreaHa(
                        geojson,
                        subtractingExclusionPolygons(pins)
                      );

                      layerMapRef.current[layer._leaflet_id] = { type: 'block', id };

                      const farmProfile = resolveFarmProfile(settings.farmProfile);
                      const cropKind = primaryEnterprise(farmProfile);
                      // Mixed farms stay neutral ("Area N"); single-enterprise uses Block/Paddock.
                      const copy = mapUiCopy(farmProfile);
                      const word =
                        copy.blockWord === 'area'
                          ? 'Area'
                          : areaWordForCropKind(cropKind);
                      const defaultName = `${word} ${blocks.length + 1}`;
                      const tree = isTreeCropKind(cropKind);
                      const newBlock: OrchardBlock = {
                        id,
                        name: defaultName,
                        cultivar: '',
                        // Species only after naming sheet confirms a tree enterprise.
                        species: tree ? farmProfile.defaultSpeciesId || '' : '',
                        cropKind,
                        geometryKind: defaultGeometryKind(cropKind),
                        density: '',
                        irrigation: '',
                        areaHa,
                        geojson,
                      };
                      if (!farmId) {
                        rejectLayer('Sign in to a farm before saving paddocks.');
                        return;
                      }
                      if (!canEdit) {
                        rejectLayer('Your role is view-only — ask a farm admin to grant edit access.');
                        return;
                      }
                      addBlock(newBlock);
                      setHighlightedBlockId(id);
                      setActiveTab('blocks');
                      // Naming sheet after paint — avoids Finish tap dismissing the new backdrop (Android).
                      window.setTimeout(() => setNamingBlock(newBlock), 50);
                    } catch (err) {
                      console.error('Failed to save paddock after draw', err);
                      alert('Could not save that paddock. Try Finish again with at least 3 points.');
                    }
                  } else if (e.layerType === 'marker') {
                    if (tab !== 'infrastructure') {
                      rejectLayer('Switch to Infrastructure to place pins.');
                      return;
                    }
                    if (!farmId) {
                      rejectLayer('Sign in to a farm before saving infrastructure.');
                      return;
                    }
                    if (!canEdit) {
                      rejectLayer('Your role is view-only — ask a farm admin to grant edit access.');
                      return;
                    }
                    const latlng = layer.getLatLng();
                    layerMapRef.current[layer._leaflet_id] = { type: 'pin', id };

                    const newPin: InfrastructurePin = {
                      id,
                      name: defaultInfraName(kind, pins.length + 1),
                      type: kind,
                      status: 'active',
                      lat: latlng.lat,
                      lng: latlng.lng,
                    };
                    addPin(newPin);
                    setEditingPinId(id);
                    setActiveTab('infrastructure');
                    setShowSidebar(true);
                  } else if (e.layerType === 'polyline') {
                    const geojson = layer.toGeoJSON();
                    if (tab === 'infrastructure') {
                      if (!farmId) {
                        rejectLayer('Sign in to a farm before saving infrastructure.');
                        return;
                      }
                      if (!canEdit) {
                        rejectLayer('Your role is view-only — ask a farm admin to grant edit access.');
                        return;
                      }
                      layerMapRef.current[layer._leaflet_id] = { type: 'pin', id };
                      let lat = viewport.lat;
                      let lng = viewport.lng;
                      try {
                        const c = turf.centroid(geojson as GeoJSON.Feature);
                        lng = c.geometry.coordinates[0];
                        lat = c.geometry.coordinates[1];
                      } catch {
                        /* keep */
                      }
                      if (infraDrawMode(kind) !== 'line') {
                        rejectLayer('Select Pipeline (or another line type) before drawing a line.');
                        return;
                      }
                      const newPin: InfrastructurePin = {
                        id,
                        name: defaultInfraName(kind, pins.length + 1),
                        type: kind,
                        status: 'active',
                        lat,
                        lng,
                        geojson,
                      };
                      addPin(newPin);
                      setEditingPinId(id);
                      setActiveTab('infrastructure');
                      setShowSidebar(true);
                    } else if (tab === 'tracks') {
                      if (!farmId) {
                        rejectLayer('Sign in to a farm before saving tracks.');
                        return;
                      }
                      if (!canEdit) {
                        rejectLayer('Your role is view-only — ask a farm admin to grant edit access.');
                        return;
                      }
                      layerMapRef.current[layer._leaflet_id] = { type: 'track', id };

                      const newTrack: FarmTrack = {
                        id,
                        name: `Track ${tracks.length + 1}`,
                        category: 'primary',
                        geojson,
                        createdAt: new Date().toISOString(),
                      };
                      addTrack(newTrack);
                      setEditingTrackId(id);
                      setHighlightedTrackId(id);
                      setActiveTab('tracks');
                      setShowSidebar(true);
                    } else {
                      rejectLayer('Switch to Tracks or Infrastructure to draw lines.');
                    }
                  }
                }}
                onEdited={(e) => {
                  const layers = e.layers;
                  layers.eachLayer((layer: any) => {
                    const mapping = layerMapRef.current[layer._leaflet_id];
                    if (!mapping) return;

                    if (mapping.type === 'block') {
                      const geojson = layer.toGeoJSON();
                      const areaHa = effectivePaddockAreaHa(
                        geojson,
                        subtractingExclusionPolygons(pins)
                      );
                      updateBlock(mapping.id, { geojson, areaHa });
                    } else if (mapping.type === 'pin') {
                      if (layer instanceof L.Marker) {
                        const latlng = layer.getLatLng();
                        updatePin(mapping.id, { lat: latlng.lat, lng: latlng.lng });
                      } else {
                        const geojson = layer.toGeoJSON();
                        let lat = viewport.lat;
                        let lng = viewport.lng;
                        try {
                          const c = turf.centroid(geojson as GeoJSON.Feature);
                          lng = c.geometry.coordinates[0];
                          lat = c.geometry.coordinates[1];
                        } catch {
                          /* keep */
                        }
                        updatePin(mapping.id, { geojson, lat, lng });
                      }
                    } else if (mapping.type === 'track') {
                      const geojson = layer.toGeoJSON();
                      updateTrack(mapping.id, { geojson });
                    }
                  });
                }}
                onDeleted={(e) => {
                  const tab = activeTabRef.current;
                  const layers = e.layers;
                  layers.eachLayer((layer: any) => {
                    const mapping = layerMapRef.current[layer._leaflet_id];
                    if (!mapping) return;

                    // Only delete the asset class for the active tab (sync will restore others)
                    if (mapping.type === 'block' && tab === 'blocks') {
                      removeBlock(mapping.id);
                      delete layerMapRef.current[layer._leaflet_id];
                    } else if (mapping.type === 'pin' && tab === 'infrastructure') {
                      removePin(mapping.id);
                      delete layerMapRef.current[layer._leaflet_id];
                    } else if (mapping.type === 'track' && tab === 'tracks') {
                      removeTrack(mapping.id);
                      delete layerMapRef.current[layer._leaflet_id];
                    }
                  });
                }}
                draw={leafletDrawOptions}
                edit={leafletEditOptions}
              />
              )}
            </FeatureGroup>

            {/* Phase 3.4: Coverage Zones — weather / soil / irrigation sensors only */}
            {activeTab === 'infrastructure' && showCoverage && pins.map(pin => {
              if (pin.status === 'offline') return null;

              let radius = 0;
              let color = '';

              if (pin.type === 'weather') { radius = 500; color = '#2563eb'; }
              else if (pin.type === 'soil') { radius = 50; color = '#d97706'; }
              else if (pin.type === 'irrigation') { radius = 150; color = '#0891b2'; }
              else return null; // dams, pipes, vehicles, fuel, hazards — no coverage circle

              return (
                <Circle 
                  key={`coverage-${pin.id}`}
                  center={[pin.lat, pin.lng]}
                  radius={radius}
                  pathOptions={{ 
                    color: color, 
                    fillColor: color, 
                    fillOpacity: 0.1,
                    weight: 1,
                    dashArray: '4 4'
                  }}
                />
              );
            })}

            {/* Daily Events — clustered markers (Step 11) */}
            {activeTab === 'analytics' && (
              <EventMarkerCluster events={dailyEvents} blockCenters={blockCenters} />
            )}

            {mapMode === 'operate' && (
              <OperateIssuesLayer
                blocks={blocks}
                issues={fieldIssues}
                openIssuesByBlock={openIssuesByBlock}
                showFlags={showIssueFlags}
                onSelectBlock={(blockId) => {
                  setHighlightedBlockId(blockId);
                  setIssuesPanelBlockId(null);
                  setSelectedIssue(null);
                }}
                onSelectIssue={(issue) => {
                  setSelectedIssue(issue);
                  setHighlightedBlockId(null);
                  setIssuesPanelBlockId(null);
                }}
              />
            )}

            <PaddockNameLayer blocks={blocks} />

            <MapHighlightsLayer
              highlights={mapHighlights}
              canDelete={canDeleteHighlight}
              onDelete={(id) => {
                void removeHighlight(id);
              }}
            />

            <BreadTrailLayer
              selfUid={userData?.uid}
              selfTrail={crewSelfTrail}
              others={crewOthers}
              prefs={
                canEnableEveryoneTrails(userData?.role)
                  ? trailPrefs
                  : { ...trailPrefs, showEveryone: false }
              }
            />

            {reportDraft && (
              <Marker
                position={[reportDraft.lat, reportDraft.lng]}
                icon={L.divIcon({
                  className: '',
                  html: `<div style="width:18px;height:18px;border-radius:50%;background:#d97706;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
                  iconSize: [18, 18],
                  iconAnchor: [9, 9],
                })}
              />
            )}

            <UserLocationLayer
              follow={followUser}
              onFix={setUserFix}
            />
            <CrewPresenceLayer others={crewOthers} />
            
          </MapContainer>

          {/* Map Controls Overlay — uniform soft keys (Phosphor marks) */}
          <div className="pufom-map-softkeys absolute top-3 right-3 flex flex-col gap-1.5 z-[1000] pointer-events-none">
            <button
              type="button"
              onClick={handleGoHome}
              title={`${mapCopy.mapTitle.replace(/ Map$/, '')} home`}
              aria-label={`${mapCopy.mapTitle.replace(/ Map$/, '')} home`}
              className="w-9 h-9 inline-flex items-center justify-center bg-white/90 backdrop-blur shadow-md rounded-lg border border-white/20 text-slate-700 hover:text-indigo-600 pointer-events-auto transition-colors active:scale-95"
            >
              <PhHouse size={20} weight="regular" className="pufom-map-icon" color="currentColor" aria-hidden />
            </button>
            <button
              type="button"
              onClick={handleLocateMe}
              title={
                userFix
                  ? followUser
                    ? 'Following you — pan to stop'
                    : 'Center on my location'
                  : 'Find my location'
              }
              aria-label="Locate me"
              aria-pressed={followUser}
              className={cn(
                'w-9 h-9 inline-flex items-center justify-center bg-white/90 backdrop-blur shadow-md rounded-lg border pointer-events-auto transition-colors active:scale-95',
                followUser || userFix
                  ? 'border-sky-500 text-sky-700 bg-sky-50 ring-1 ring-sky-500/30'
                  : 'border-white/20 text-slate-700 hover:text-indigo-600'
              )}
            >
              <PhCrosshair
                size={20}
                weight={followUser ? 'fill' : 'regular'}
                className="pufom-map-icon"
                color="currentColor"
                aria-hidden
              />
            </button>
            {mapMode === 'operate' && (
              <>
                <button
                  type="button"
                  onClick={() => setShowIssueFlags((v) => !v)}
                  title={showIssueFlags ? 'Hide issue flags' : 'Show issue flags'}
                  aria-label={showIssueFlags ? 'Hide issue flags' : 'Show issue flags'}
                  aria-pressed={showIssueFlags}
                  className={cn(
                    'w-9 h-9 inline-flex items-center justify-center bg-white/90 backdrop-blur shadow-md rounded-lg border pointer-events-auto transition-colors active:scale-95',
                    showIssueFlags
                      ? 'border-amber-500 text-amber-800 bg-amber-50 ring-1 ring-amber-500/40'
                      : 'border-white/20 text-slate-700 hover:text-amber-700'
                  )}
                >
                  <PhFlag
                    size={20}
                    weight={showIssueFlags ? 'fill' : 'regular'}
                    className="pufom-map-icon"
                    color="currentColor"
                    aria-hidden
                  />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (placingHighlight || highlightDraftGeo) {
                      cancelHighlightPaint();
                      return;
                    }
                    startHighlightPaint();
                  }}
                  title={
                    placingHighlight || highlightDraftGeo
                      ? 'Cancel check-this highlight'
                      : 'Check this — paint an area for the crew'
                  }
                  aria-label={
                    placingHighlight || highlightDraftGeo
                      ? 'Cancel check-this highlight'
                      : 'Check this area'
                  }
                  aria-pressed={placingHighlight || Boolean(highlightDraftGeo)}
                  className={cn(
                    'w-9 h-9 inline-flex items-center justify-center bg-white/90 backdrop-blur shadow-md rounded-lg border pointer-events-auto transition-colors active:scale-95',
                    placingHighlight || highlightDraftGeo
                      ? 'border-teal-600 text-teal-800 bg-teal-50 ring-1 ring-teal-500/40'
                      : 'border-white/20 text-slate-700 hover:text-teal-700'
                  )}
                >
                  <Hexagon size={20} className="pufom-map-icon shrink-0" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = !placingFlag;
                    if (next) cancelHighlightPaint();
                    setPlacingFlag(next);
                    setReportDraft(null);
                    setIssuesPanelBlockId(null);
                    setSelectedIssue(null);
                    if (next && selectedOperateBlock) {
                      fitBlockInView(selectedOperateBlock);
                    }
                  }}
                  title={placingFlag ? 'Cancel adding issue' : 'Add issue — tap map to drop pin'}
                  aria-label={placingFlag ? 'Cancel adding issue' : 'Add issue'}
                  aria-pressed={placingFlag}
                  className={cn(
                    'w-9 h-9 inline-flex items-center justify-center bg-white/90 backdrop-blur shadow-md rounded-lg border pointer-events-auto transition-colors active:scale-95',
                    placingFlag
                      ? 'border-amber-500 text-amber-800 bg-amber-50 ring-1 ring-amber-500/40'
                      : 'border-white/20 text-slate-700 hover:text-amber-700'
                  )}
                >
                  <AddIssueIcon size={22} className="pufom-map-icon" />
                </button>
              </>
            )}
          </div>

          {mapMode === 'operate' && (
            <div className="absolute top-3 left-3 z-[1000] pointer-events-none">
              <BreadTrailToggles
                prefs={trailPrefs}
                canEveryone={canEnableEveryoneTrails(userData?.role)}
                onChange={updateTrailPrefs}
              />
            </div>
          )}

          {mapMode === 'operate' && placingFlag && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1100] pointer-events-none">
              <div className="bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg">
                {selectedOperateBlock
                  ? `Tap inside ${selectedOperateBlock.name || 'block'} to drop pin`
                  : 'Tap the map to drop a pin'}
              </div>
            </div>
          )}

          {mapMode === 'operate' && placingHighlight && !highlightDraftGeo && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1100] pointer-events-none">
              <div className="bg-teal-700 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg">
                Trace an area — Finish when done
              </div>
            </div>
          )}

          {mapMode === 'operate' && highlightDraftGeo && (
            <HighlightComposeSheet
              role={userData?.role}
              farmDefaultSeconds={settings.highlightDefaultSeconds}
              busy={highlightSending}
              onCancel={cancelHighlightPaint}
              onSend={({ note, durationSeconds }) => {
                setHighlightSending(true);
                void createHighlight({
                  geojson: highlightDraftGeo,
                  note,
                  durationSeconds,
                  audience: 'all',
                })
                  .then(() => {
                    setHighlightDraftGeo(null);
                  })
                  .finally(() => setHighlightSending(false));
              }}
            />
          )}

          {/* Operate mode: block status card */}
          <AnimatePresence>
            {mapMode === 'operate' &&
              selectedOperateBlock &&
              !placingFlag &&
              !placingHighlight &&
              !highlightDraftGeo &&
              !issuesPanelBlockId &&
              !reportDraft &&
              !selectedIssue && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                className="absolute bottom-24 lg:bottom-10 left-1/2 -translate-x-1/2 z-[1100] w-[calc(100%-1.5rem)] sm:w-full px-2 flex justify-center pointer-events-none"
              >
                <BlockOperateCard
                  block={selectedOperateBlock}
                  openIssues={openIssuesByBlock[selectedOperateBlock.id] || 0}
                  chill={{
                    portions: farmChill.data?.totalPortions ?? null,
                    loading: farmChill.loading,
                    error: farmChill.error,
                    stationName: farmChill.data?.stationName,
                    seasonLabel: farmChill.data?.seasonLabel,
                  }}
                  onClose={() => setHighlightedBlockId(null)}
                  onViewIssues={() => {
                    setIssuesPanelBlockId(selectedOperateBlock.id);
                  }}
                  onReportIssue={() => startReportForBlock(selectedOperateBlock)}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {mapMode === 'operate' && issuesPanelBlock && !reportDraft && (
            <BlockIssuesSheet
              blockName={issuesPanelBlock.name || 'Unnamed block'}
              issues={issuesForPanel}
              onClose={() => setIssuesPanelBlockId(null)}
              onSelectIssue={(issue) => {
                setSelectedIssue(issue);
                setIssuesPanelBlockId(null);
                if (mapInstance) mapInstance.flyTo([issue.lat, issue.lng], 17);
              }}
              onReport={() => startReportForBlock(issuesPanelBlock)}
              onResolve={
                farmId
                  ? (issue) => {
                      void updateFieldIssue(farmId, issue.id, {
                        status: 'resolved',
                        resolvedAt: new Date().toISOString(),
                      });
                    }
                  : undefined
              }
            />
          )}

          {mapMode === 'operate' && reportDraft && (
            <ReportIssueSheet
              location={reportDraft}
              blockName={
                reportDraft.blockId
                  ? blocks.find((b) => b.id === reportDraft.blockId)?.name
                  : undefined
              }
              onCancel={() => {
                setReportDraft(null);
                setPlacingFlag(true);
              }}
              onSave={handleSaveIssue}
            />
          )}

          {mapMode === 'operate' && selectedIssue && !reportDraft && (
            <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-[1200] sm:inset-auto sm:left-1/2 sm:bottom-10 sm:-translate-x-1/2 sm:w-full sm:max-w-md p-3 sm:p-0">
              <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
                <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {selectedIssue.note ||
                        `${selectedIssue.category.charAt(0).toUpperCase()}${selectedIssue.category.slice(1)} issue`}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 capitalize">
                      {selectedIssue.priority} priority · {selectedIssue.status}
                      {!selectedIssue.note ? ` · ${selectedIssue.category}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedIssue(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="px-4 pb-4 space-y-3">
                  <p className="text-[10px] text-slate-400 capitalize">
                    {selectedIssue.category} · reported{' '}
                    {new Date(selectedIssue.reportedAt).toLocaleString()}
                  </p>
                  {farmId && selectedIssue.status !== 'resolved' && (
                    <button
                      type="button"
                      onClick={() => {
                        void updateFieldIssue(farmId, selectedIssue.id, {
                          status: 'resolved',
                          resolvedAt: new Date().toISOString(),
                        }).then(() => setSelectedIssue(null));
                      }}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
                    >
                      Mark resolved
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Bottom Status Bar - Centered Pill */}
          {mapMode === 'edit' && <MapStatusBar map={mapInstance} activeTab={activeTab} />}

          {/* Tablet-safe draw actions (Undo / Finish / Cancel) — avoids ghost points under menu */}
          <DrawingActionBar
            map={mapInstance}
            enabled={
              (mapMode === 'edit' && canEdit && !boundaryEditBlockId) ||
              (mapMode === 'operate' && placingHighlight) ||
              Boolean(internalBoundaryDrawing && mapMode === 'edit' && canEdit)
            }
            onCancel={() => {
              clearInternalBoundaryDraw();
            }}
          />
          <BoundaryEditActionBar
            map={mapInstance}
            enabled={Boolean(boundaryEditBlockId) && mapMode === 'edit' && canEdit}
            selected={boundaryEditRef.current?.selectedIndex != null}
            canDelete={
              Boolean(boundaryEditRef.current) &&
              boundaryEditRef.current?.selectedIndex != null &&
              boundaryEditVertexCount(boundaryEditRef.current) > 3
            }
            onSave={saveBoundaryEdit}
            onDeletePoint={() => {
              if (!boundaryEditRef.current) return;
              deleteSelectedVertex(boundaryEditRef.current);
              setBoundaryEditTick((t) => t + 1);
            }}
            onCancel={cancelBoundaryEditUi}
            onAddInternalBoundary={
              boundaryEditBlockId && canEdit
                ? (kind) => beginInternalBoundaryDraw(kind, boundaryEditBlockId)
                : undefined
            }
          />
          {/* force re-render of edit bar when vertices change */}
          <span className="hidden" aria-hidden>
            {boundaryEditTick}
          </span>
          {internalBoundaryDrawing && mapMode === 'edit' && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1100] pointer-events-none w-[calc(100%-1.5rem)] max-w-md">
              <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur shadow-lg px-3 py-2 text-center">
                <p className="text-xs font-semibold text-slate-800">
                  Drawing{' '}
                  {getInfraType(internalBoundaryDrawing.kind)?.shortLabel || 'internal boundary'}
                  {(() => {
                    const b = blocks.find((x) => x.id === internalBoundaryDrawing.blockId);
                    return b?.name ? ` · ${b.name}` : '';
                  })()}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Tap to place points · Finish when closed · Cancel to abort
                </p>
              </div>
            </div>
          )}
          
          {/* Coverage Zones Legend */}
          <AnimatePresence>
            {activeTab === 'infrastructure' && showCoverage && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute bottom-24 lg:bottom-12 right-4 z-[1000] bg-white/95 backdrop-blur shadow-lg rounded-xl border border-slate-200 p-3 pointer-events-auto"
              >
                <h4 className="text-xs font-semibold text-slate-900 mb-2 uppercase tracking-wider">Coverage Zones</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-600/20 border border-blue-600 border-dashed"></div>
                    <span className="text-xs text-slate-600">Weather Station (500m)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-600/20 border border-amber-600 border-dashed"></div>
                    <span className="text-xs text-slate-600">Soil Sensor (50m)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-cyan-600/20 border border-cyan-600 border-dashed"></div>
                    <span className="text-xs text-slate-600">Irrigation Valve (150m)</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Global Styles for Leaflet Draw overrides */}
          <style>{`
            ${PUFAM_FILL_PATTERN_CSS}
            ${PUFAM_TRACK_STROKE_CSS}
            path.smooth-polygon-transition {
              transition: fill 0.15s ease-out, stroke 0.15s ease-out;
            }
            .leaflet-editing-icon {
              width: 14px !important;
              height: 14px !important;
              margin-left: -7px !important;
              margin-top: -7px !important;
              border-radius: 50% !important;
              background-color: white !important;
              border: 2px solid #4f46e5 !important;
            }
            .leaflet-draw-tooltip {
              background: #1e293b !important;
              border: 1px solid #334155 !important;
              color: white !important;
              box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1) !important;
            }
            .leaflet-draw-tooltip-single { margin-top: -12px !important; }
            .leaflet-draw-tooltip-subtext { color: #94a3b8 !important; }
            .leaflet-draw-tooltip::before { border-right-color: #334155 !important; }
            /* React DrawingActionBar owns Finish/Undo/Cancel — hide stock menu (ghost taps). */
            .leaflet-container.pufom-using-draw-bar .leaflet-draw-actions {
              display: none !important;
              pointer-events: none !important;
            }
            /* Plus / Add pad / Add hazard / Edit boundary are the only draw entry points. */
            .orchard-map-leaflet .leaflet-draw {
              display: none !important;
              pointer-events: none !important;
            }
            /* Paddock/track fills must not steal tap-to-vertex (survives highlight setStyle). */
            .leaflet-container.pufom-draw-over-paddocks .leaflet-overlay-pane path,
            .leaflet-container.pufom-using-draw-bar .leaflet-overlay-pane path {
              pointer-events: none !important;
            }
            .pufom-boundary-vertex {
              background: transparent !important;
              border: none !important;
            }
            .leaflet-container.pufom-boundary-editing {
              cursor: crosshair;
            }
            @media (max-width: 640px) {
              .leaflet-draw-toolbar a {
                width: 36px !important;
                height: 36px !important;
                line-height: 36px !important;
              }
              .leaflet-bar a {
                width: 36px !important;
                height: 36px !important;
                line-height: 36px !important;
              }
            }
            .leaflet-container {
              touch-action: none;
            }
            /* Zoom sits bottomright; keep it clear of the attribution strip. */
            .orchard-map-leaflet .leaflet-bottom.leaflet-right .leaflet-control-zoom {
              margin-bottom: 28px;
            }
            .orchard-map-leaflet .leaflet-control-attribution {
              max-width: min(42vw, 220px);
              font-size: 10px;
              line-height: 1.25;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              background: rgba(255, 255, 255, 0.72);
            }
            .pufom-user-location-icon {
              background: transparent !important;
              border: none !important;
            }
            .pufom-user-loc {
              position: relative;
              width: 28px;
              height: 28px;
            }
            .pufom-user-loc__pulse {
              position: absolute;
              inset: 0;
              border-radius: 9999px;
              background: rgba(37, 99, 235, 0.35);
              animation: pufom-user-pulse 2s ease-out infinite;
            }
            .pufom-user-loc__dot {
              position: absolute;
              left: 50%;
              top: 50%;
              width: 14px;
              height: 14px;
              margin: -7px 0 0 -7px;
              border-radius: 9999px;
              background: #2563eb;
              border: 3px solid #fff;
              box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
            }
            @keyframes pufom-user-pulse {
              0% { transform: scale(0.55); opacity: 0.85; }
              70% { transform: scale(1.35); opacity: 0; }
              100% { transform: scale(1.35); opacity: 0; }
            }
            .pufom-crew-presence-icon {
              background: transparent !important;
              border: none !important;
            }
            .pufom-crew-loc {
              position: relative;
              width: 22px;
              height: 22px;
            }
            .pufom-crew-loc__dot {
              position: absolute;
              left: 50%;
              top: 50%;
              width: 14px;
              height: 14px;
              margin: -7px 0 0 -7px;
              border-radius: 9999px;
              background: var(--crew-colour, #0f766e);
              border: 2px solid #fff;
              box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
            }
            @keyframes pufom-hl-pulse {
              0%, 100% { fill-opacity: 0.16; stroke-opacity: 0.75; }
              50% { fill-opacity: 0.38; stroke-opacity: 1; }
            }
            .pufom-map-highlight-poly {
              animation: pufom-hl-pulse 1.6s ease-in-out infinite;
            }
            .pufom-highlight-wm {
              background: transparent !important;
              border: none !important;
            }
            .pufom-highlight-wm__label {
              font: 700 12px/1.2 system-ui, sans-serif;
              color: var(--hl-colour, #0f766e);
              text-align: center;
              white-space: nowrap;
              text-shadow:
                0 0 3px #fff,
                0 0 6px #fff,
                1px 1px 0 #fff,
                -1px -1px 0 #fff,
                1px -1px 0 #fff,
                -1px 1px 0 #fff;
              pointer-events: none;
            }
            .pufom-paddock-name {
              background: transparent !important;
              border: none !important;
            }
            .pufom-paddock-name__label {
              font: 800 13px/1.15 system-ui, sans-serif;
              color: #f8fafc;
              text-align: center;
              white-space: nowrap;
              letter-spacing: 0.01em;
              text-shadow:
                0 0 4px rgba(0,0,0,.85),
                0 1px 2px rgba(0,0,0,.9),
                1px 1px 0 rgba(0,0,0,.75),
                -1px -1px 0 rgba(0,0,0,.75);
              pointer-events: none;
            }
          `}</style>
        </div>
      </div>

      {namingBlock && (
        <NewPaddockSheet
          block={namingBlock}
          farmProfile={settings.farmProfile}
          onDismiss={() => {
            // Skip: keep name/cropKind but strip orchard defaults if this isn't a tree paddock.
            if (namingBlock.cropKind && !isTreeCropKind(namingBlock.cropKind)) {
              updateBlock(namingBlock.id, {
                species: '',
                cultivar: namingBlock.seasonLabel || '',
                density: '',
              });
            }
            setNamingBlock(null);
          }}
          onSave={(updates) => {
            updateBlock(namingBlock.id, updates);
            setNamingBlock(null);
          }}
        />
      )}

      {/* Block & Pin Metadata Modals */}
      <AnimatePresence>
        {editingBlockId && !namingBlock && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => {
                setEditingBlockId(null);
                setIsConfirmingDeleteBlock(false);
              }}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 max-h-[90vh] overflow-y-auto"
            >
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="font-bold text-slate-900">
                  {areaWordForCropKind(blocks.find((b) => b.id === editingBlockId)?.cropKind)} details
                </h3>
                <button 
                  onClick={() => {
                    setEditingBlockId(null);
                    setIsConfirmingDeleteBlock(false);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                {(() => {
                  const block = blocks.find(b => b.id === editingBlockId);
                  if (!block) return null;

                  const farmProfile = resolveFarmProfile(settings.farmProfile);
                  const kindOptions = farmProfile.enterprises.length
                    ? farmProfile.enterprises
                    : (['orchard_tree'] as FarmEnterpriseId[]);
                  const kind = (block.cropKind && kindOptions.includes(block.cropKind)
                    ? block.cropKind
                    : kindOptions[0]!) as FarmEnterpriseId;
                  const tree = isTreeCropKind(kind);
                  const ent = getEnterprise(kind);

                  return (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          {areaWordForCropKind(kind)} name
                        </label>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            value={block.name}
                            onChange={(e) => updateBlock(block.id, { name: e.target.value })}
                            className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                            placeholder="e.g. North Ridge A"
                          />
                          {block.areaHa !== undefined && (
                            <div className="flex items-center justify-center px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 whitespace-nowrap" title="Calculated Area">
                              {block.areaHa} ha
                            </div>
                          )}
                        </div>
                      </div>

                      {(() => {
                        const internals = internalBoundariesIntersectingBlock(block, pins);
                        return (
                          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                Internal boundaries
                              </label>
                              <span className="text-[10px] text-slate-400">
                                {internals.length === 0 ? 'None' : `${internals.length}`}
                              </span>
                            </div>
                            {internals.length > 0 ? (
                              <ul className="space-y-1">
                                {internals.map((pin) => {
                                  const def = getInfraType(pin.type);
                                  return (
                                    <li key={pin.id}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingBlockId(null);
                                          setIsConfirmingDeleteBlock(false);
                                          setEditingPinId(pin.id);
                                        }}
                                        className="w-full flex items-center justify-between gap-2 rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 text-left text-xs hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors"
                                      >
                                        <span className="font-medium text-slate-800 truncate">
                                          {pin.name || def?.shortLabel || 'Boundary'}
                                        </span>
                                        <span
                                          className={cn(
                                            'shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded',
                                            pin.type === 'internal_impassable'
                                              ? 'bg-orange-100 text-orange-800'
                                              : 'bg-stone-100 text-stone-700'
                                          )}
                                        >
                                          {pin.type === 'internal_impassable'
                                            ? 'Impassable'
                                            : 'Passable'}
                                        </span>
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : (
                              <p className="text-[11px] text-slate-500 leading-snug">
                                Pads stay in usable area; hazard zones subtract from ha.
                              </p>
                            )}
                            {canEdit && mapMode === 'edit' ? (
                              <div className="flex gap-2 pt-0.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    beginInternalBoundaryDraw('internal_passable', block.id)
                                  }
                                  className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-stone-200/80 text-stone-800 text-[11px] font-semibold hover:bg-stone-300 transition-colors"
                                >
                                  <Hexagon className="w-3.5 h-3.5" />
                                  Add pad
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    beginInternalBoundaryDraw('internal_impassable', block.id)
                                  }
                                  className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-orange-100 text-orange-900 text-[11px] font-semibold hover:bg-orange-200 transition-colors"
                                >
                                  <Hexagon className="w-3.5 h-3.5" />
                                  Add hazard
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}

                      {kindOptions.length > 1 && (
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                            Type
                          </label>
                          <select
                            value={kind}
                            onChange={(e) => {
                              const next = e.target.value as FarmEnterpriseId;
                              const nextTree = isTreeCropKind(next);
                              updateBlock(block.id, {
                                cropKind: next,
                                geometryKind: defaultGeometryKind(next),
                                ...(nextTree
                                  ? {}
                                  : { species: '', density: '', cultivar: block.seasonLabel || '' }),
                              });
                            }}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          >
                            {kindOptions.map((id) => (
                              <option key={id} value={id}>
                                {getEnterprise(id).label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {tree ? (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Species</label>
                              <input
                                type="text"
                                value={block.species || ''}
                                onChange={(e) => updateBlock(block.id, { species: e.target.value })}
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                placeholder="e.g. walnut"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Cultivar</label>
                              <select 
                                value={block.cultivar}
                                onChange={(e) => updateBlock(block.id, { cultivar: e.target.value })}
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white"
                              >
                                <option value="">Select cultivar...</option>
                                {CULTIVARS.map((c) => (
                                  <option key={c.id} value={c.name}>
                                    {c.name} ({c.requiredCP} CP)
                                  </option>
                                ))}
                                <option value="Other">Other / Mixed</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Row Spacing</label>
                              <div className="relative">
                                <input 
                                  type="number" 
                                  value={block.rowSpacing || ''}
                                  onChange={(e) => {
                                    const rowSpacing = parseFloat(e.target.value);
                                    const treeSpacing = block.treeSpacing || 0;
                                    const updates: Partial<OrchardBlock> = { rowSpacing };
                                    if (rowSpacing > 0 && treeSpacing > 0) {
                                      updates.density = Math.round(10000 / (rowSpacing * treeSpacing)).toString();
                                    }
                                    updateBlock(block.id, updates);
                                  }}
                                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all pr-8"
                                  placeholder="8"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                                  m
                                </span>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Tree Spacing</label>
                              <div className="relative">
                                <input 
                                  type="number" 
                                  value={block.treeSpacing || ''}
                                  onChange={(e) => {
                                    const treeSpacing = parseFloat(e.target.value);
                                    const rowSpacing = block.rowSpacing || 0;
                                    const updates: Partial<OrchardBlock> = { treeSpacing };
                                    if (rowSpacing > 0 && treeSpacing > 0) {
                                      updates.density = Math.round(10000 / (rowSpacing * treeSpacing)).toString();
                                    }
                                    updateBlock(block.id, updates);
                                  }}
                                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all pr-8"
                                  placeholder="6"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                                  m
                                </span>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Tree Height</label>
                              <div className="relative">
                                <input 
                                  type="number" 
                                  value={block.treeHeight || ''}
                                  onChange={(e) => updateBlock(block.id, { treeHeight: parseFloat(e.target.value) })}
                                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all pr-8"
                                  placeholder="4.5"
                                  step="0.1"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                                  m
                                </span>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Canopy Width</label>
                              <div className="relative">
                                <input 
                                  type="number" 
                                  value={block.canopyWidth || ''}
                                  onChange={(e) => updateBlock(block.id, { canopyWidth: parseFloat(e.target.value) })}
                                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all pr-8"
                                  placeholder="4.0"
                                  step="0.1"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                                  m
                                </span>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Irrigation</label>
                              <select 
                                value={block.irrigation}
                                onChange={(e) => updateBlock(block.id, { irrigation: e.target.value })}
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white"
                              >
                                <option value="">Select...</option>
                                <option value="drip">Drip</option>
                                <option value="micro-sprinkler">Micro-sprinkler</option>
                                <option value="sprinkler">Overhead Sprinkler</option>
                                <option value="none">Dryland / None</option>
                              </select>
                            </div>

                            <div className="col-span-2 p-3 bg-indigo-50 border border-indigo-100 rounded-xl space-y-1">
                              <div className="flex justify-between items-center">
                                <p className="text-[10px] font-bold text-slate-700 uppercase font-mono">Calculated TRV</p>
                                <span className="text-sm font-bold text-indigo-600 font-mono">
                                  {block.treeHeight && block.canopyWidth && block.rowSpacing 
                                    ? Math.round((block.treeHeight * block.canopyWidth * 10000) / block.rowSpacing).toLocaleString()
                                    : '0'} m³/ha
                                </span>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="space-y-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                              {ent.varietyLabel}
                            </label>
                            <input
                              type="text"
                              value={block.seasonLabel || block.cultivar || ''}
                              onChange={(e) =>
                                updateBlock(block.id, {
                                  seasonLabel: e.target.value,
                                  cultivar: e.target.value,
                                  species: '',
                                })
                              }
                              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                              placeholder={
                                ent.paddockModel === 'dam'
                                  ? 'e.g. Marron'
                                  : ent.paddockModel === 'water_zone'
                                    ? 'e.g. Bore 2 zone'
                                    : 'e.g. 2026 canola'
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Irrigation</label>
                            <select 
                              value={block.irrigation}
                              onChange={(e) => updateBlock(block.id, { irrigation: e.target.value })}
                              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white"
                            >
                              <option value="">Select...</option>
                              <option value="drip">Drip</option>
                              <option value="micro-sprinkler">Micro-sprinkler</option>
                              <option value="sprinkler">Overhead Sprinkler</option>
                              <option value="none">Dryland / None</option>
                            </select>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            Tree spacing, TRV and Kc only apply to orchard / fruit / vineyard areas.
                          </p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
                {isConfirmingDeleteBlock ? (
                  <div className="flex items-center justify-between w-full gap-3">
                    <span className="text-sm font-medium text-red-600">Delete this block?</span>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setIsConfirmingDeleteBlock(false)}
                        className="px-4 py-2 text-slate-600 hover:bg-slate-200 text-sm font-medium rounded-xl transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={() => {
                          removeBlock(editingBlockId);
                          setEditingBlockId(null);
                          setIsConfirmingDeleteBlock(false);
                          
                          // We also need to remove the layer from the map to clean up the UI immediately
                          if (featureGroupRef.current) {
                            const layers = featureGroupRef.current.getLayers();
                            layers.forEach((layer: any) => {
                              const mapping = layerMapRef.current[layer._leaflet_id];
                              if (mapping && mapping.type === 'block' && mapping.id === editingBlockId) {
                                featureGroupRef.current?.removeLayer(layer);
                                delete layerMapRef.current[layer._leaflet_id];
                              }
                            });
                          }
                        }}
                        className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition-colors shadow-sm"
                      >
                        Yes, Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button 
                      onClick={() => setIsConfirmingDeleteBlock(true)}
                      className="px-4 py-2 text-red-600 hover:bg-red-50 text-sm font-medium rounded-xl transition-colors"
                    >
                      Delete Block
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => beginBoundaryEdit(editingBlockId)}
                        disabled={!canEdit || mapMode !== 'edit'}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 text-sm font-medium rounded-xl transition-colors disabled:opacity-40"
                      >
                        <Hexagon className="w-4 h-4" />
                        Edit boundary
                      </button>
                      <button 
                        onClick={() => {
                          setEditingBlockId(null);
                          setIsConfirmingDeleteBlock(false);
                        }}
                        className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
                      >
                        Save & Close
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}

        <BoundaryImportSheet
          open={showBoundaryImport}
          onClose={() => setShowBoundaryImport(false)}
          currentFarmId={farmId || ''}
          currentFarmName={settings.farmName || 'Farm'}
          onCurrentFarmBlock={async (block) => {
            await addBlock(block);
          }}
          onCurrentFarmDelete={async (id) => {
            await removeBlock(id);
          }}
          onImported={async ({ currentAdded }) => {
            if (!farmId || currentAdded <= 0) return;
            // Rehydrate from IndexedDB so list + FeatureGroup sync even if a
            // canEdit-gated addBlock no-op skipped the zustand append.
            fittedToBlocksFarmRef.current = null;
            await loadData(farmId);
            // Allow React to commit blocks before fitting
            window.requestAnimationFrame(() => {
              fitFarmInView({ animate: true });
            });
          }}
        />

        {editingPinId && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => {
                setEditingPinId(null);
                setIsConfirmingDeletePin(false);
              }}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 max-h-[90vh] overflow-y-auto"
            >
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="font-bold text-slate-900">Infrastructure Metadata</h3>
                <button 
                  onClick={() => {
                    setEditingPinId(null);
                    setIsConfirmingDeletePin(false);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                {(() => {
                  const pin = pins.find(p => p.id === editingPinId);
                  if (!pin) return null;

                  return (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Name</label>
                        <input 
                          type="text" 
                          value={pin.name}
                          onChange={(e) => updatePin(pin.id, { name: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                          placeholder="e.g. North dam, Standpipe 2"
                        />
                      </div>
                      
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Type</label>
                        <select 
                          value={pin.type}
                          onChange={(e) => {
                            const next = e.target.value as InfraTypeId;
                            const prevMode = infraDrawMode(pin.type);
                            const nextMode = infraDrawMode(next);
                            const updates: Partial<InfrastructurePin> = { type: next };
                            // Drop polygon/line geometry when switching to a point type.
                            if (
                              (prevMode === 'polygon' || prevMode === 'line') &&
                              nextMode === 'point'
                            ) {
                              updates.geojson = undefined;
                            }
                            if (next !== 'vehicle') {
                              updates.trackerId = undefined;
                            }
                            updatePin(pin.id, updates);
                          }}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white"
                        >
                          <option value="">Select type...</option>
                          {INFRA_TYPES.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.label}
                              {infraSubtractsFromPaddock(t.id)
                                ? ' — cuts paddock area'
                                : t.id === 'internal_passable'
                                  ? ' — keeps paddock area'
                                  : ''}
                            </option>
                          ))}
                        </select>
                        {getInfraType(pin.type)?.blurb ? (
                          <p className="text-[11px] text-slate-500 leading-snug">
                            {getInfraType(pin.type)?.blurb}
                          </p>
                        ) : null}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</label>
                        <select 
                          value={pin.status}
                          onChange={(e) => updatePin(pin.id, { status: e.target.value as any })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white"
                        >
                          <option value="active">Active (Online)</option>
                          <option value="warning">Warning (Needs Attention)</option>
                          <option value="offline">Offline (Maintenance)</option>
                        </select>
                      </div>

                      {pin.type === 'vehicle' && (
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                            Tracker ID
                          </label>
                          <input
                            type="text"
                            value={pin.trackerId || ''}
                            onChange={(e) =>
                              updatePin(pin.id, { trackerId: e.target.value || undefined })
                            }
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                            placeholder="Optional"
                          />
                          <p className="text-[11px] text-slate-400">
                            Meshy / GPS tracker id (optional). Live position is future work — pin is
                            home/park for now.
                          </p>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Notes</label>
                        <textarea
                          value={pin.notes || ''}
                          onChange={(e) =>
                            updatePin(pin.id, { notes: e.target.value || undefined })
                          }
                          rows={3}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-y min-h-[4.5rem]"
                          placeholder="Optional notes"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Coordinates</label>
                        <div className="w-full px-3 py-2 border border-slate-100 bg-slate-50 rounded-xl text-xs font-mono text-slate-500">
                          {pin.lat.toFixed(6)}, {pin.lng.toFixed(6)}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
                {isConfirmingDeletePin ? (
                  <div className="flex items-center justify-between w-full gap-3">
                    <span className="text-sm font-medium text-red-600">Delete this pin?</span>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setIsConfirmingDeletePin(false)}
                        className="px-4 py-2 text-slate-600 hover:bg-slate-200 text-sm font-medium rounded-xl transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={() => {
                          removePin(editingPinId);
                          setEditingPinId(null);
                          setIsConfirmingDeletePin(false);
                          
                          if (featureGroupRef.current) {
                            const layers = featureGroupRef.current.getLayers();
                            layers.forEach((layer: any) => {
                              const mapping = layerMapRef.current[layer._leaflet_id];
                              if (mapping && mapping.type === 'pin' && mapping.id === editingPinId) {
                                featureGroupRef.current?.removeLayer(layer);
                                delete layerMapRef.current[layer._leaflet_id];
                              }
                            });
                          }
                        }}
                        className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition-colors shadow-sm"
                      >
                        Yes, Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button 
                      onClick={() => setIsConfirmingDeletePin(true)}
                      className="px-4 py-2 text-red-600 hover:bg-red-50 text-sm font-medium rounded-xl transition-colors"
                    >
                      Delete Pin
                    </button>
                    <button 
                      onClick={() => {
                        setEditingPinId(null);
                        setIsConfirmingDeletePin(false);
                      }}
                      className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
                    >
                      Save & Close
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {editingTrackId && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => {
                setEditingTrackId(null);
                setIsConfirmingDeleteTrack(false);
              }}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 max-h-[90vh] overflow-y-auto"
            >
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="font-bold text-slate-900">Track Details</h3>
                <button 
                  onClick={() => {
                    setEditingTrackId(null);
                    setIsConfirmingDeleteTrack(false);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                {(() => {
                  const track = tracks.find(t => t.id === editingTrackId);
                  if (!track) return null;

                  return (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Track Name</label>
                        <input 
                          type="text" 
                          defaultValue={track.name}
                          key={`track-name-${track.id}`}
                          onChange={(e) => debouncedUpdateTrackName(track.id, e.target.value)}
                          onBlur={(e) => {
                            debouncedUpdateTrackName.flush();
                            if (e.target.value !== track.name) {
                              updateTrack(track.id, { name: e.target.value });
                            }
                          }}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                          placeholder="e.g. Main Access Road"
                        />
                      </div>
                      
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Category</label>
                        <select 
                          value={track.category}
                          onChange={(e) => updateTrack(track.id, { category: e.target.value as any })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white"
                        >
                          <option value="primary">Primary (Main Road)</option>
                          <option value="secondary">Secondary (Inter-block)</option>
                          <option value="service">Service (Utility/Irrigation)</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Created At</label>
                        <div className="w-full px-3 py-2 border border-slate-100 bg-slate-50 rounded-xl text-xs font-mono text-slate-500">
                          {new Date(track.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
                {isConfirmingDeleteTrack ? (
                  <div className="flex items-center justify-between w-full gap-3">
                    <span className="text-sm font-medium text-red-600">Delete this track?</span>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setIsConfirmingDeleteTrack(false)}
                        className="px-4 py-2 text-slate-600 hover:bg-slate-200 text-sm font-medium rounded-xl transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={() => {
                          removeTrack(editingTrackId);
                          setEditingTrackId(null);
                          setIsConfirmingDeleteTrack(false);
                          
                          if (featureGroupRef.current) {
                            const layers = featureGroupRef.current.getLayers();
                            layers.forEach((layer: any) => {
                              const mapping = layerMapRef.current[layer._leaflet_id];
                              if (mapping && mapping.type === 'track' && mapping.id === editingTrackId) {
                                featureGroupRef.current?.removeLayer(layer);
                                delete layerMapRef.current[layer._leaflet_id];
                              }
                            });
                          }
                        }}
                        className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition-colors shadow-sm"
                      >
                        Yes, Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button 
                      onClick={() => setIsConfirmingDeleteTrack(true)}
                      className="px-4 py-2 text-red-600 hover:bg-red-50 text-sm font-medium rounded-xl transition-colors"
                    >
                      Delete Track
                    </button>
                    <button 
                      onClick={() => {
                        setEditingTrackId(null);
                        setIsConfirmingDeleteTrack(false);
                      }}
                      className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
                    >
                      Save & Close
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Quick Guide Overlay */}
      <AnimatePresence>
        {showHelp && (
          <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
              onClick={() => setShowHelp(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-indigo-600 text-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-xl">
                    <Info className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Orchard Twin Guide</h2>
                    <p className="text-indigo-100 text-xs">Master your digital orchard</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowHelp(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <section className="space-y-3">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">1</div>
                    Switching Modes
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    In <strong>Edit paddocks</strong>, use the top bar to switch between <strong>Blocks</strong>, <strong>Tracks</strong>, <strong>Infrastructure</strong>, and <strong>Analytics</strong>. 
                  </p>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-500 italic">
                    Tip: On mobile, these are arranged in a grid for quick access.
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">2</div>
                    Managing Blocks
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Select the <strong>Blocks</strong> mode to draw new orchard sections. Use the polygon tool on the bottom-left of the map to trace your boundaries.
                  </p>
                </section>

                <section className="space-y-3">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">3</div>
                    Drawing Tracks
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Open <strong>Tracks</strong>, then use the <strong>+</strong> button or the polyline tool to click along a pathway.
                    Finish the line to save it. Tap a track on the map or in the list to rename it and set primary / secondary / service.
                  </p>
                </section>

                <section className="space-y-3">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">4</div>
                    Predictive Analytics
                  </h3>
                  <div className="flex gap-4 items-start">
                    <div className="flex-shrink-0 p-2 bg-amber-100 text-amber-600 rounded-xl">
                      <BarChart3 className="w-5 h-5" />
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      The <strong>Analytics</strong> tab shows today’s risk and yield heatmaps from weather data and your farm diary. Use the sidebar to switch between Risk and Yield views.
                    </p>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">5</div>
                    Search & edit
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Use the search field in the top bar to jump to a place. Tap <strong>Edit</strong> to draw or change paddocks, tracks, and infrastructure.
                  </p>
                </section>

                {basemapPack && (
                  <section className="space-y-3 border-t border-slate-100 pt-4">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-slate-500" />
                      Offline satellite map
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Your farm imagery is stored on this device. Only update or clear it when you need a fresher download.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={basemapBusy}
                        onClick={() => {
                          setShowHelp(false);
                          openBasemapSetup(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 disabled:opacity-50"
                      >
                        <RefreshCw className={cn('w-3.5 h-3.5', basemapBusy && 'animate-spin')} />
                        Update map pack
                      </button>
                      <button
                        type="button"
                        disabled={basemapBusy}
                        onClick={() => {
                          setShowHelp(false);
                          void handleClearBasemap();
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-50 text-rose-800 text-xs font-semibold hover:bg-rose-100 disabled:opacity-50"
                      >
                        Clear local pack
                      </button>
                    </div>
                  </section>
                )}
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100">
                <button 
                  onClick={() => setShowHelp(false)}
                  className="w-full py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-[0.98]"
                >
                  Got it, let's go!
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
