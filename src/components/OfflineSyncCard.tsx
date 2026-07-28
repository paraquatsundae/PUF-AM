import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CloudUpload,
  Copy,
  Download,
  HardDriveDownload,
  Loader2,
  Radar,
  RefreshCw,
  Upload,
  Wifi,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { flushFarmOutbox } from '../lib/flushFarmOutbox';
import { flushPhotoOutbox } from '../lib/flushPhotoOutbox';
import { flushPendingGeometry } from '../lib/farmGeometrySync';
import {
  discoverSyncPeersDetailed,
  fetchSyncSelf,
  getSelectedSyncPeerBase,
  setSelectedSyncPeerBase,
  type PufomSyncPeer,
} from '../lib/mdnsPeers';
import { nsdBrowseAvailable } from '../lib/nsdPeers';
import {
  cacheWeatherForOffline,
  defaultOfflineWeatherStation,
  getWeatherCacheMeta,
} from '../lib/weatherCacheIdb';
import {
  downloadBytes,
  exportPufomFile,
  getSyncPendingCounts,
  importPufomFile,
  lanBundleMeta,
  pullLanBundle,
  pushLanBundle,
  type SyncPendingCounts,
} from '../lib/pufomSync';
import { clsx } from 'clsx';

export function OfflineSyncCard() {
  const { userData } = useAuth();
  const farmId = userData?.farmId || '';
  const fileRef = useRef<HTMLInputElement>(null);

  const [pending, setPending] = useState<SyncPendingCounts>({
    outbox: 0,
    geometry: 0,
    photos: 0,
    total: 0,
  });
  const [lanMeta, setLanMeta] = useState<{ updatedAt: string; bytes: number } | null>(null);
  const [weatherMeta, setWeatherMeta] = useState<{
    stationCode: string;
    updatedAt: string;
    dayCount: number;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [peers, setPeers] = useState<PufomSyncPeer[]>([]);
  const [selectedPeer, setSelectedPeer] = useState(getSelectedSyncPeerBase());
  const [hubLabel, setHubLabel] = useState<string | null>(null);
  const [scanSource, setScanSource] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!farmId) return;
    try {
      const counts = await getSyncPendingCounts(farmId);
      setPending(counts);
      const meta = await lanBundleMeta(farmId);
      setLanMeta(meta ? { updatedAt: meta.updatedAt, bytes: meta.bytes } : null);
      const selfInfo = await fetchSyncSelf();
      if (selfInfo.self) {
        setHubLabel(`${selfInfo.self.name} · ${selfInfo.self.baseUrl}`);
      }
      const wMeta = await getWeatherCacheMeta();
      setWeatherMeta(wMeta);
    } catch {
      /* ignore meta errors when offline / no admin */
    }
  }, [farmId]);

  useEffect(() => {
    void refresh();
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const t = setInterval(() => void refresh(), 15000);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      clearInterval(t);
    };
  }, [refresh]);

  const selectPeer = (baseUrl: string) => {
    setSelectedSyncPeerBase(baseUrl || null);
    setSelectedPeer(baseUrl);
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    setMessage(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (!farmId) return null;

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-emerald-50 rounded-xl">
          <HardDriveDownload className="w-5 h-5 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-900">Offline & sync</h2>
          <p className="text-sm text-slate-500">
            Export a compressed <code className="text-xs">.pufom</code> farm pack, import from
            another tablet, or push/pull via the workshop PC on Wi‑Fi.
          </p>
        </div>
        <span
          className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${
            online
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
              : 'bg-amber-50 text-amber-700 border-amber-100'
          }`}
        >
          {online ? 'Online' : 'Offline'}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-3">
          <p className="text-xl font-bold text-slate-900">{pending.total}</p>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Pending</p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-3">
          <p className="text-xl font-bold text-slate-900">{pending.outbox}</p>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Diary / issues</p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-3">
          <p className="text-xl font-bold text-slate-900">{pending.geometry}</p>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Map edits</p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-3">
          <p className="text-xl font-bold text-slate-900">{pending.photos}</p>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Photos</p>
        </div>
      </div>

      {error && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
          {error}
        </div>
      )}
      {message && (
        <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
          {message}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!busy}
          onClick={() =>
            void run('export', async () => {
              const { bytes, filename } = await exportPufomFile(farmId);
              downloadBytes(bytes, filename);
              setMessage(`Saved ${filename} (${Math.round(bytes.length / 1024)} KB)`);
            })
          }
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
        >
          {busy === 'export' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Export .pufom
        </button>

        <button
          type="button"
          disabled={!!busy}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === 'import' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Import .pufom
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pufom,application/octet-stream"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            void run('import', async () => {
              const result = await importPufomFile(file, farmId);
              setMessage(
                `Merged pack — ${result.blocks} blocks, ${result.issues} issues, ${result.diary} diary events. Reload map/diary if open.`
              );
            });
          }}
        />

        <button
          type="button"
          disabled={!!busy || !online}
          onClick={() =>
            void run('flush', async () => {
              const g = await flushPendingGeometry(farmId);
              const o = await flushFarmOutbox(farmId);
              const p = await flushPhotoOutbox(farmId);
              const flushed = g.flushed + o.flushed + p.flushed;
              const failed = g.failed + o.failed + p.failed;
              setMessage(
                `Flushed ${flushed} ops to cloud` +
                  (p.flushed ? ` (${p.flushed} photos)` : '') +
                  (failed ? ` (${failed} still pending)` : '')
              );
            })
          }
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === 'flush' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Flush to cloud
        </button>
      </div>

      <div className="border-t border-slate-100 pt-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-800">Offline weather</p>
            <p className="text-xs text-slate-500">
              {weatherMeta
                ? `${weatherMeta.stationCode} · ${weatherMeta.dayCount} days · ${new Date(weatherMeta.updatedAt).toLocaleString()}`
                : 'No station pack on this device yet'}
            </p>
          </div>
          <button
            type="button"
            disabled={!!busy || !online}
            onClick={() =>
              void run('weather', async () => {
                const r = await cacheWeatherForOffline({
                  stationCode: defaultOfflineWeatherStation(),
                });
                setMessage(
                  `Cached ${r.stationCode} weather offline (${r.dayCount} days)`
                );
              })
            }
            className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {busy === 'weather' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <HardDriveDownload className="w-4 h-4" />
            )}
            Cache weather
          </button>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Wifi className="w-4 h-4 text-emerald-600" />
          LAN shelf + hub discovery
        </div>
        <p className="text-xs text-slate-500">
          Keep <code className="text-[11px]">npm run dev</code> on the workshop PC — it advertises as{' '}
          <code className="text-[11px]">_pufom-sync._tcp</code>. On the tablet APK, Scan uses native
          NSD (no PC IP needed). Browser / live-reload asks the current hub to browse peers.
        </p>
        {scanSource && (
          <p className="text-[11px] text-slate-400">Last scan: {scanSource}</p>
        )}
        {hubLabel && (
          <div className="flex items-start justify-between gap-2 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
            <p className="text-xs text-slate-600 min-w-0 break-all">This hub: {hubLabel}</p>
            <button
              type="button"
              title="Copy hub URL"
              onClick={() => {
                const url = hubLabel.split(' · ').pop();
                if (url) void navigator.clipboard.writeText(url);
              }}
              className="shrink-0 p-1 text-slate-400 hover:text-slate-700"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!busy}
            onClick={() =>
              void run('scan', async () => {
                const { peers: found, source } = await discoverSyncPeersDetailed(3200);
                setPeers(found);
                setScanSource(
                  source === 'nsd'
                    ? 'native NSD'
                    : source === 'mixed'
                      ? 'NSD + hub browse'
                      : source === 'hub'
                        ? 'hub browse'
                        : 'none'
                );
                setMessage(
                  found.length
                    ? `Found ${found.length} hub${found.length === 1 ? '' : 's'} (${source === 'nsd' ? 'NSD' : source})`
                    : nsdBrowseAvailable()
                      ? 'No hubs via NSD — is npm run dev advertising on this Wi‑Fi?'
                      : 'No hubs from this host — open the tablet APK for native NSD, or connect via LAN URL first.'
                );
              })
            }
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {busy === 'scan' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Radar className="w-4 h-4" />
            )}
            {nsdBrowseAvailable() ? 'Scan for hubs' : 'Scan mDNS peers'}
          </button>
          {selectedPeer && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => {
                selectPeer('');
                setMessage('Using default API host for LAN sync');
              }}
              className="text-xs text-slate-500 hover:text-slate-800 underline"
            >
              Clear peer selection
            </button>
          )}
        </div>

        {peers.length > 0 && (
          <ul className="space-y-2">
            {peers.map((peer) => {
              const active = selectedPeer === peer.baseUrl || (!selectedPeer && peer.self);
              return (
                <li key={peer.id}>
                  <button
                    type="button"
                    onClick={() => {
                      selectPeer(peer.baseUrl);
                      setMessage(`LAN sync → ${peer.name} (${peer.baseUrl})`);
                    }}
                    className={clsx(
                      'w-full text-left px-3 py-2.5 rounded-xl border transition-colors',
                      active
                        ? 'border-emerald-300 bg-emerald-50/70'
                        : 'border-slate-200 hover:border-slate-300'
                    )}
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {peer.name}
                      {peer.self ? (
                        <span className="ml-2 text-[10px] font-bold uppercase text-emerald-700">
                          this hub
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {peer.baseUrl}
                      {peer.host ? ` · ${peer.host}` : ''}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {selectedPeer && (
          <p className="text-xs text-emerald-800">
            Push/pull target: <span className="font-mono">{selectedPeer}</span>
          </p>
        )}

        {lanMeta && (
          <p className="text-xs text-slate-500">
            Shelf: {Math.round(lanMeta.bytes / 1024)} KB · updated{' '}
            {new Date(lanMeta.updatedAt).toLocaleString()}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!busy || !online}
            onClick={() =>
              void run('push', async () => {
                const r = await pushLanBundle(farmId);
                setMessage(`Pushed ${Math.round(r.bytes / 1024)} KB to LAN shelf`);
              })
            }
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-700 text-white text-sm font-medium disabled:opacity-50"
          >
            {busy === 'push' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CloudUpload className="w-4 h-4" />
            )}
            Push to LAN
          </button>
          <button
            type="button"
            disabled={!!busy || !online}
            onClick={() =>
              void run('pull', async () => {
                const result = await pullLanBundle(farmId);
                if (!result) {
                  setMessage('No pack on the LAN shelf yet — push from another device first.');
                  return;
                }
                setMessage(
                  `Pulled & merged — ${result.blocks} blocks, ${result.issues} issues, ${result.diary} diary.`
                );
              })
            }
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-200 text-emerald-900 text-sm font-medium hover:bg-emerald-50 disabled:opacity-50"
          >
            {busy === 'pull' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <HardDriveDownload className="w-4 h-4" />
            )}
            Pull from LAN
          </button>
        </div>
      </div>
    </div>
  );
}
