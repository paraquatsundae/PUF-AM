import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, Rectangle, ZoomControl } from 'react-leaflet';
import {
  AlertTriangle,
  HardDrive,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Satellite,
  Trash2,
  X,
} from 'lucide-react';
import {
  BBOX_BUFFER_M,
  CENTER_HALF_EXTENT_M,
  BasemapPack,
  LatLngBoundsLiteral,
  bufferBbox,
  bboxCenter,
  adoptBasemapPack,
  clearBasemapPack,
  formatPackBytes,
  planPackZoom,
  scanBasemapDeviceStorage,
  setBasemapSkipped,
  squareBboxAround,
  type BasemapDeviceStats,
} from '../../lib/basemapPack';
import { downloadBasemapPack } from '../../lib/tileDownloader';
import { useFarmDiary } from '../../lib/farmDiary';
import { mapUiCopy } from '../../../shared/farm/farmTypes';
import { EsriPreviewTileLayer } from './CachedTileLayer';

type NominatimResult = {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox?: [string, string, string, string]; // south, north, west, east
};

type Props = {
  farmId: string;
  onComplete: () => void;
  /** Dismiss without download (skip or close manage flow). */
  onCancel?: () => void;
  /** When true, this is first-time setup (skip still allowed). */
  forceSetup?: boolean;
};

function nominatimToBbox(result: NominatimResult): LatLngBoundsLiteral {
  if (result.boundingbox && result.boundingbox.length === 4) {
    const [south, north, west, east] = result.boundingbox.map(Number);
    return bufferBbox({ south, north, west, east }, BBOX_BUFFER_M);
  }
  return squareBboxAround(parseFloat(result.lat), parseFloat(result.lon), CENTER_HALF_EXTENT_M);
}

export function FarmBasemapSetup({ farmId, onComplete, onCancel, forceSetup }: Props) {
  const { settings } = useFarmDiary();
  const placeWord = useMemo(() => {
    // Orchard-only farms keep “orchard”; mixed / broadacre / station use neutral “farm”.
    return mapUiCopy(settings.farmProfile).mapTitle === 'Orchard Map' ? 'orchard' : 'farm';
  }, [settings.farmProfile]);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selected, setSelected] = useState<{
    label: string;
    bbox: LatLngBoundsLiteral;
  } | null>(null);
  const [step, setStep] = useState<'search' | 'confirm' | 'downloading' | 'done'>('search');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({
    percent: 0,
    label: '',
    done: 0,
    total: 0,
    bytes: 0,
    reused: 0,
  });
  const [deviceStats, setDeviceStats] = useState<BasemapDeviceStats | null>(null);
  const [scanningDevice, setScanningDevice] = useState(false);
  const [adoptingId, setAdoptingId] = useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const zoomPlan = useMemo(() => {
    if (!selected) return null;
    return planPackZoom(selected.bbox);
  }, [selected]);

  const center = selected ? bboxCenter(selected.bbox) : { lat: -34.24, lng: 116.14 };

  const refreshDeviceScan = async () => {
    setScanningDevice(true);
    try {
      setDeviceStats(await scanBasemapDeviceStorage());
    } catch (e) {
      console.error('[Basemap] device scan failed', e);
      setDeviceStats({ packCount: 0, tileCount: 0, bytes: 0, packs: [] });
    } finally {
      setScanningDevice(false);
    }
  };

  useEffect(() => {
    void refreshDeviceScan();
  }, []);

  const otherPacks = useMemo(
    () => (deviceStats?.packs ?? []).filter((p) => p.farmId !== farmId),
    [deviceStats, farmId]
  );
  const thisFarmPack = useMemo(
    () => (deviceStats?.packs ?? []).find((p) => p.farmId === farmId) ?? null,
    [deviceStats, farmId]
  );

  const adoptExistingPack = async (pack: BasemapPack) => {
    setAdoptingId(pack.farmId);
    setError(null);
    try {
      setBasemapSkipped(farmId, false);
      await adoptBasemapPack(pack, farmId);
      setStep('done');
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not use that saved map.');
    } finally {
      setAdoptingId(null);
    }
  };

  const deleteDevicePack = async (pack: BasemapPack) => {
    const label = pack.farmId === farmId ? 'this farm' : 'another farm on this device';
    if (
      !confirm(
        `Remove “${pack.label}” (${formatPackBytes(pack.bytes)}) for ${label}? Tiles still needed by other saved maps stay on the device.`
      )
    ) {
      return;
    }
    setError(null);
    try {
      await clearBasemapPack(pack.farmId);
      await refreshDeviceScan();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove that map.');
    }
  };

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setIsSearching(true);
    setError(null);
    setResults([]);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(q)}`,
        {
          headers: {
            Accept: 'application/json',
            'Accept-Language': 'en-AU,en',
            // Browser fetch may strip User-Agent; identify via Referer + app name in query context.
          },
        }
      );
      if (!res.ok) throw new Error('Location search failed');
      const data = (await res.json()) as NominatimResult[];
      setResults(data);
      if (data.length === 0) {
        setError(`No places found. Try a town or property name near your ${placeWord}.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed — check your connection.');
    } finally {
      setIsSearching(false);
    }
  };

  const pickResult = (r: NominatimResult) => {
    setSelected({ label: r.display_name, bbox: nominatimToBbox(r) });
    setStep('confirm');
    setError(null);
  };

  const handleSkip = () => {
    setBasemapSkipped(farmId, true);
    onCancel?.();
  };

  const startDownload = async () => {
    if (!selected || !zoomPlan || zoomPlan.overBudget) return;
    setStep('downloading');
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setBasemapSkipped(farmId, false);
      await downloadBasemapPack({
        farmId,
        label: selected.label,
        bbox: selected.bbox,
        minZoom: zoomPlan.minZoom,
        maxZoom: zoomPlan.maxZoom,
        signal: controller.signal,
        onProgress: (p) =>
          setProgress({
            percent: p.percent,
            label: p.currentLabel,
            done: p.done,
            total: p.total,
            bytes: p.bytes,
            reused: p.reused,
          }),
      });
      setStep('done');
      onComplete();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setError('Download cancelled. Your previous offline map (if any) was kept.');
        setStep('confirm');
      } else {
        setError(e instanceof Error ? e.message : 'Download failed.');
        setStep('confirm');
      }
    } finally {
      abortRef.current = null;
    }
  };

  const cancelDownload = () => {
    abortRef.current?.abort();
  };

  return (
    <div className="absolute inset-0 z-[4000] flex flex-col bg-slate-950/95 backdrop-blur-sm">
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 p-3 sm:p-6 gap-4">
        {/* Left panel */}
        <div className="w-full lg:w-[400px] flex-shrink-0 bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[50vh] lg:max-h-none">
          <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50 flex items-start gap-3">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <Satellite className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-slate-900">Set up farm map</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Search for your {placeWord}, then save satellite imagery to this device for offline use.
              </p>
            </div>
            {onCancel && step !== 'downloading' && (
              <button
                type="button"
                onClick={forceSetup ? handleSkip : onCancel}
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                aria-label={forceSetup ? 'Skip for now' : 'Close'}
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {step === 'search' && (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <HardDrive className="w-4 h-4 text-emerald-600" />
                      Maps on this device
                    </div>
                    <button
                      type="button"
                      onClick={() => void refreshDeviceScan()}
                      disabled={scanningDevice}
                      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${scanningDevice ? 'animate-spin' : ''}`} />
                      Rescan
                    </button>
                  </div>
                  {scanningDevice && !deviceStats ? (
                    <p className="text-xs text-slate-500 flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Scanning local storage…
                    </p>
                  ) : deviceStats && deviceStats.packCount === 0 ? (
                    <p className="text-xs text-slate-500">
                      No offline satellite packs found yet. Search below to download one — later
                      downloads reuse tiles already stored here.
                    </p>
                  ) : deviceStats ? (
                    <>
                      <p className="text-[11px] text-slate-500">
                        {deviceStats.packCount} saved map
                        {deviceStats.packCount === 1 ? '' : 's'} ·{' '}
                        {deviceStats.tileCount.toLocaleString()} unique tiles ·{' '}
                        {formatPackBytes(deviceStats.bytes)} used
                      </p>
                      <ul className="space-y-2 max-h-40 overflow-y-auto">
                        {thisFarmPack && (
                          <li className="p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/80 text-xs">
                            <p className="font-semibold text-emerald-900">Already linked to this farm</p>
                            <p className="text-emerald-800/90 mt-0.5 leading-snug">{thisFarmPack.label}</p>
                            <p className="text-emerald-700/80 mt-1">
                              {thisFarmPack.tileCount.toLocaleString()} tiles ·{' '}
                              {formatPackBytes(thisFarmPack.bytes)}
                            </p>
                          </li>
                        )}
                        {otherPacks.map((pack) => (
                          <li
                            key={`${pack.farmId}-${pack.createdAt}`}
                            className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-2"
                          >
                            <div>
                              <p className="text-xs font-semibold text-slate-900 leading-snug">
                                {pack.label}
                              </p>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                {pack.tileCount.toLocaleString()} tiles · {formatPackBytes(pack.bytes)} · z
                                {pack.minZoom}–{pack.maxZoom}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={adoptingId === pack.farmId}
                                onClick={() => void adoptExistingPack(pack)}
                                className="flex-1 py-1.5 px-2 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700 disabled:opacity-50"
                              >
                                {adoptingId === pack.farmId ? 'Linking…' : 'Use for this farm'}
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteDevicePack(pack)}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200"
                                title="Remove from this device"
                                aria-label="Remove map pack"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>

                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {deviceStats && deviceStats.packCount > 0
                    ? 'Or download a new area'
                    : `Where is your ${placeWord}?`}
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                      placeholder="e.g. Manjimup WA"
                      className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                      autoFocus
                    />
                  </div>
                  <button
                    type="button"
                    onClick={runSearch}
                    disabled={isSearching || !query.trim()}
                    className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                  </button>
                </div>

                <ul className="space-y-2">
                  {results.map((r) => (
                    <li key={`${r.lat}-${r.lon}-${r.display_name}`}>
                      <button
                        type="button"
                        onClick={() => pickResult(r)}
                        className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 transition-colors"
                      >
                        <div className="flex gap-2 items-start">
                          <MapPin className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-slate-800 leading-snug">{r.display_name}</span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {(step === 'confirm' || step === 'downloading') && selected && zoomPlan && (
              <>
                <button
                  type="button"
                  disabled={step === 'downloading'}
                  onClick={() => setStep('search')}
                  className="text-xs font-medium text-emerald-600 hover:underline disabled:opacity-40"
                >
                  ← Change location
                </button>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Selected</p>
                  <p className="text-sm font-medium text-slate-900 leading-snug">{selected.label}</p>
                </div>

                <div
                  className={`p-4 border rounded-xl space-y-2 ${
                    zoomPlan.overBudget
                      ? 'bg-rose-50 border-rose-200'
                      : 'bg-amber-50 border-amber-200'
                  }`}
                >
                  <div
                    className={`flex items-center gap-2 font-bold text-sm ${
                      zoomPlan.overBudget ? 'text-rose-800' : 'text-amber-800'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                    {zoomPlan.overBudget ? 'Area too large' : 'Save to this device'}
                  </div>
                  {zoomPlan.overBudget ? (
                    <p className="text-xs text-rose-900/90">
                      This region needs about{' '}
                      <strong>{zoomPlan.tileCount.toLocaleString()}</strong> tiles (~
                      <strong>{zoomPlan.mbLabel}</strong>) even at zoom {zoomPlan.maxZoom}. Search a
                      tighter place (town or property name), not a whole state or region.
                    </p>
                  ) : (
                    <ul className="text-xs text-amber-900/90 space-y-1.5 list-disc pl-4">
                      <li>
                        About <strong>{zoomPlan.tileCount.toLocaleString()}</strong> map tiles
                        (~<strong>{zoomPlan.mbLabel}</strong> if none are cached yet).
                      </li>
                      <li>
                        Tiles already on this device are <strong>reused</strong> — overlapping downloads
                        do not store the same imagery twice.
                      </li>
                      <li>
                        Zoom levels {zoomPlan.minZoom}–{zoomPlan.maxZoom} for this farm region.
                        {zoomPlan.zoomReduced
                          ? ' (Detail reduced so the pack fits on this device.)'
                          : null}
                      </li>
                      <li>Uses free Esri World Imagery. Attribution shown on the map.</li>
                      <li>Needs a good connection once; afterwards works offline in the paddock.</li>
                    </ul>
                  )}
                </div>

                {step === 'downloading' && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-medium text-slate-600">
                      <span>{progress.label}</span>
                      <span>{progress.percent}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-400">
                      {progress.done.toLocaleString()} / {progress.total.toLocaleString()} tiles ·{' '}
                      {(progress.bytes / (1024 * 1024)).toFixed(1)} MB ·{' '}
                      {progress.reused.toLocaleString()} reused from device
                    </p>
                  </div>
                )}
              </>
            )}

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl">
                {error}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-2">
            {step === 'search' && (
              <>
                {onCancel && (
                  <button
                    type="button"
                    onClick={forceSetup ? handleSkip : onCancel}
                    className="w-full py-2.5 text-sm font-semibold text-slate-600 hover:bg-white rounded-xl border border-slate-200"
                  >
                    Skip for now
                  </button>
                )}
                <p className="text-[10px] text-slate-400 text-center">
                  Search powered by OpenStreetMap Nominatim · PUFAM farm map
                </p>
              </>
            )}
            {step === 'confirm' && zoomPlan && (
              <>
                <button
                  type="button"
                  onClick={startDownload}
                  disabled={zoomPlan.overBudget}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 disabled:opacity-50 disabled:shadow-none"
                >
                  <HardDrive className="w-5 h-5" />
                  Download &amp; save farm map
                </button>
                {onCancel && (
                  <button
                    type="button"
                    onClick={forceSetup ? handleSkip : onCancel}
                    className="w-full py-2 text-sm font-medium text-slate-500 hover:text-slate-800"
                  >
                    Skip for now
                  </button>
                )}
              </>
            )}
            {step === 'downloading' && (
              <button
                type="button"
                onClick={cancelDownload}
                className="w-full py-3 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-white"
              >
                Cancel download
              </button>
            )}
          </div>
        </div>

        {/* Preview map */}
        <div className="flex-1 min-h-[220px] rounded-2xl overflow-hidden border border-slate-700 relative shadow-inner">
          <MapContainer
            key={selected ? `${selected.bbox.south}-${selected.bbox.west}` : 'default'}
            center={[center.lat, center.lng]}
            zoom={selected ? 13 : 10}
            className="absolute inset-0"
            zoomControl={false}
          >
            <EsriPreviewTileLayer />
            <ZoomControl position="bottomleft" />
            {selected && (
              <Rectangle
                bounds={[
                  [selected.bbox.south, selected.bbox.west],
                  [selected.bbox.north, selected.bbox.east],
                ]}
                pathOptions={{ color: '#10b981', weight: 2, fillOpacity: 0.15 }}
              />
            )}
          </MapContainer>
          {!selected && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-slate-900/30">
              <p className="text-white text-sm font-medium bg-slate-900/70 px-4 py-2 rounded-full">
                Search and select a location to preview the save area
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
