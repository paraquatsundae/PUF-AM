/**
 * One piece of sync state behind the three Settings → Sync cards.
 *
 * The cards are split by *pipe* — Wi‑Fi (LAN), the farm's own backend, and
 * files on this device — but they share one hub, one busy flag and one set of
 * pending counts, so they share one hook rather than three copies that can
 * disagree about whether a hub was found. Every action reports through a
 * zone-tagged note, so the answer appears in the card whose button was pressed.
 *
 * Moved out of the old single `OfflineSyncCard`; the behaviour is unchanged.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §2
 */

import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../../contexts/AuthContext';
import { flushFarmOutbox } from '../../lib/flushFarmOutbox';
import { flushPhotoOutbox } from '../../lib/flushPhotoOutbox';
import { flushPendingGeometry } from '../../lib/farmGeometrySync';
import {
  discoverSyncPeersDetailed,
  fetchSyncSelf,
  getSelectedSyncPeerBase,
  setSelectedSyncPeerBase,
  type PufomSyncPeer,
} from '../../lib/mdnsPeers';
import { nsdBrowseAvailable } from '../../lib/nsdPeers';
import { apiHubMissing, isPackagedNativeAndroid } from '../../lib/apiBase';
import {
  clearFarmGateway,
  ensureSyncHub,
  rememberGatewayIdentity,
  useFarmGateway,
  useManualHub,
  type SyncHubResolution,
} from '../../lib/syncHub';
import { readFarmGateway, sameHubBase, type FarmGateway } from '../../lib/farmGateway';
import { defaultDeviceName, fetchHubInfo, pairWithHub } from '../../lib/hubPairing';
import { getHubToken } from '../../lib/hubIdentity';
import type { HubInfo } from '../../../shared/sync/hubInfo';
import {
  cacheWeatherForOffline,
  defaultOfflineWeatherStation,
  getWeatherCacheMeta,
} from '../../lib/weatherCacheIdb';
import {
  downloadBytes,
  exportPufomFile,
  getSyncPendingCounts,
  importPufomFile,
  lanBundleMeta,
  pullLanBundle,
  pushLanBundle,
  type SyncPendingCounts,
} from '../../lib/pufomSync';
import {
  downloadFarmExportJson,
  downloadFarmExportXlsx,
  downloadFarmExportZip,
} from '../../lib/farmExport';
import { useMapStoreInternal } from '../../lib/mapStore';
import { getLastFarm } from '../../lib/deviceSession';

/** Which card a note belongs in. */
export type SyncZone = 'lan' | 'gateway' | 'cloud' | 'files';

export type SyncNote = { zone: SyncZone; tone: 'ok' | 'error'; text: string };

export type WeatherCacheMeta = {
  stationCode: string;
  updatedAt: string;
  dayCount: number;
};

export function useFarmSync() {
  const { userData } = useAuth();
  const farmId = userData?.farmId || '';

  const [pending, setPending] = useState<SyncPendingCounts>({
    outbox: 0,
    geometry: 0,
    photos: 0,
    total: 0,
  });
  const [lanMeta, setLanMeta] = useState<{ updatedAt: string; bytes: number } | null>(null);
  const [weatherMeta, setWeatherMeta] = useState<WeatherCacheMeta | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<SyncNote | null>(null);
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [peers, setPeers] = useState<PufomSyncPeer[]>([]);
  const [selectedPeer, setSelectedPeer] = useState(getSelectedSyncPeerBase());
  const [hubLabel, setHubLabel] = useState<string | null>(null);
  const [scanSource, setScanSource] = useState<string | null>(null);
  const [hubMissing, setHubMissing] = useState(apiHubMissing());
  const [hubInfo, setHubInfo] = useState<HubInfo | null>(null);
  const [needsPairing, setNeedsPairing] = useState(false);
  const [gateway, setGateway] = useState<FarmGateway | null>(() => readFarmGateway());
  /** The ladder fell through to the gateway, so this is how the farm is reachable now. */
  const [gatewayInUse, setGatewayInUse] = useState(false);
  const [gatewayIdentityChanged, setGatewayIdentityChanged] = useState(false);
  const needsHub = isPackagedNativeAndroid();

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

  /**
   * The APK has no Express of its own, so `/api/*` goes nowhere until a hub is
   * found. Do it on mount rather than waiting for the operator to press Scan —
   * the laptop advertises itself and the tablet can just notice.
   */
  const applyResolution = useCallback((res: SyncHubResolution) => {
    if (res.baseUrl) setSelectedPeer(res.baseUrl);
    setHubInfo(res.info ?? null);
    setNeedsPairing(Boolean(res.needsPairing));
    setHubMissing(apiHubMissing());
    setGateway(readFarmGateway());
    setGatewayInUse(res.source === 'gateway');
    setGatewayIdentityChanged(Boolean(res.identityChanged));
  }, []);

  useEffect(() => {
    void ensureSyncHub()
      .then(applyResolution)
      .catch(() => setHubMissing(apiHubMissing()));
  }, [applyResolution]);

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

  const selectPeer = useCallback((baseUrl: string, announce = false) => {
    setSelectedSyncPeerBase(baseUrl || null);
    setSelectedPeer(baseUrl);
    setHubMissing(apiHubMissing());
    if (!baseUrl) {
      setHubInfo(null);
      setNeedsPairing(false);
      if (announce) {
        setNote({ zone: 'lan', tone: 'ok', text: 'Using the default address for Wi‑Fi sync' });
      }
      return;
    }
    if (announce) setNote({ zone: 'lan', tone: 'ok', text: `Wi‑Fi sync → ${baseUrl}` });
    // Ask the new hub what it is straight away, so a packaged PUF-AM hub asks for
    // its pairing code here rather than 401-ing the next button pressed.
    void fetchHubInfo(baseUrl).then((info) => {
      setHubInfo(info);
      setNeedsPairing(Boolean(info?.pairingRequired) && !getHubToken(baseUrl));
    });
  }, []);

  /**
   * Run one operator action. The returned string is what the card says
   * afterwards; a throw becomes the same line in the error tone.
   */
  const run = useCallback(
    async (zone: SyncZone, label: string, fn: () => Promise<string | void>) => {
      setBusy(label);
      setNote(null);
      try {
        const text = await fn();
        if (text) setNote({ zone, tone: 'ok', text });
        await refresh();
      } catch (e) {
        setNote({ zone, tone: 'error', text: e instanceof Error ? e.message : String(e) });
      } finally {
        setBusy(null);
      }
    },
    [refresh]
  );

  // ---- Wi‑Fi (LAN) -------------------------------------------------------

  const scanForHubs = () =>
    void run('lan', 'scan', async () => {
      const { peers: found, source } = await discoverSyncPeersDetailed(3200);
      setPeers(found);
      // On a tablet the first hub found is almost always the only one, and
      // leaving it unselected means Scan "worked" while push and pull still
      // have nowhere to go.
      if (found.length && (hubMissing || !selectedPeer)) {
        selectPeer(found[0].baseUrl);
      }
      setScanSource(
        source === 'nsd'
          ? 'native NSD'
          : source === 'mixed'
            ? 'NSD + hub browse'
            : source === 'hub'
              ? 'hub browse'
              : 'none'
      );
      return found.length
        ? `Found ${found.length} hub${found.length === 1 ? '' : 's'} (${source === 'nsd' ? 'NSD' : source})`
        : nsdBrowseAvailable()
          ? 'No hubs via NSD — is npm run dev advertising on this Wi‑Fi?'
          : 'No hubs from this host — open the tablet APK for native NSD, or connect via LAN URL first.';
    });

  const setManualHubAddress = (address: string) =>
    void run('lan', 'hub', async () => {
      const res = await useManualHub(address);
      applyResolution(res);
      return res.needsPairing
        ? `Found ${res.baseUrl} — now enter its pairing code below.`
        : `Hub set to ${res.baseUrl}`;
    });

  const pair = (pairingCode: string) =>
    void run('lan', 'pair', async () => {
      const result = await pairWithHub(selectedPeer, pairingCode, defaultDeviceName());
      setHubInfo(result.info);
      setNeedsPairing(false);
      setHubMissing(apiHubMissing());
      return `Paired with ${result.info.name} as “${result.deviceName}”. Push, pull and join now work through it.`;
    });

  // ---- Farm gateway ------------------------------------------------------

  const setGatewayAddress = (address: string) =>
    void run('gateway', 'gateway', async () => {
      const result = await useFarmGateway(address);
      applyResolution(result.resolution);
      setGateway(result.gateway);
      const where = result.gateway.hubName || result.gateway.base;
      if (result.resolution.needsPairing) {
        return `Found ${where} — now enter its pairing code below.`;
      }
      return result.adopted
        ? `Gateway set to ${where}. It is the hub this tablet is already paired with, so nothing ` +
            'else is needed — sync and join now work away from the shed Wi‑Fi.'
        : `Gateway set to ${where}. Sync and join now work away from the shed Wi‑Fi.`;
    });

  /**
   * Pairing at the gateway address, for the case adoption cannot cover: a tablet
   * that has never been on the farm's Wi‑Fi at all, so it has no pairing to reuse.
   */
  const pairGateway = (pairingCode: string) =>
    void run('gateway', 'pair-gateway', async () => {
      const base = gateway?.base;
      if (!base) throw new Error('Set the gateway address first.');
      const result = await pairWithHub(base, pairingCode, defaultDeviceName());
      // The operator has just said "this machine is my gateway", so it becomes the
      // identity the guard compares against — otherwise the next resolve would
      // drop the pairing that was only just made.
      rememberGatewayIdentity(result.info);
      setGateway(readFarmGateway());
      setHubInfo(result.info);
      setNeedsPairing(false);
      setGatewayIdentityChanged(false);
      setHubMissing(apiHubMissing());
      return `Paired with ${result.info.name} as “${result.deviceName}” over the gateway.`;
    });

  const forgetGateway = () =>
    void run('gateway', 'gateway-forget', async () => {
      clearFarmGateway();
      setGateway(null);
      setGatewayInUse(false);
      setGatewayIdentityChanged(false);
      setHubMissing(apiHubMissing());
      return 'Gateway forgotten. This tablet now syncs only when a PUF-AM laptop is on its Wi‑Fi.';
    });

  const pushToLan = () =>
    void run('lan', 'push', async () => {
      const r = await pushLanBundle(farmId);
      return `Pushed ${Math.round(r.bytes / 1024)} KB to the Wi‑Fi shelf`;
    });

  const pullFromLan = () =>
    void run('lan', 'pull', async () => {
      const result = await pullLanBundle(farmId);
      if (!result) return 'Nothing on the Wi‑Fi shelf yet — push from another device first.';
      await useMapStoreInternal.getState().loadData(farmId);
      return `Pulled & merged — ${result.blocks} blocks, ${result.pins} pins, ${result.issues} issues, ${result.diary} diary.`;
    });

  // ---- Cloud -------------------------------------------------------------

  const flushToCloud = () =>
    void run('cloud', 'flush', async () => {
      const g = await flushPendingGeometry(farmId);
      const o = await flushFarmOutbox(farmId);
      const p = await flushPhotoOutbox(farmId);
      const flushed = g.flushed + o.flushed + p.flushed;
      const failed = g.failed + o.failed + p.failed;
      return (
        `Flushed ${flushed} ops to cloud` +
        (p.flushed ? ` (${p.flushed} photos)` : '') +
        (failed ? ` (${failed} still pending)` : '')
      );
    });

  // ---- Files & backup ----------------------------------------------------

  const exportPack = () =>
    void run('files', 'export', async () => {
      const { bytes, filename } = await exportPufomFile(farmId);
      downloadBytes(bytes, filename);
      return `Saved ${filename} (${Math.round(bytes.length / 1024)} KB)`;
    });

  const importPack = (file: File) =>
    void run('files', 'import', async () => {
      const result = await importPufomFile(file, farmId);
      await useMapStoreInternal.getState().loadData(farmId);
      return `Merged pack — ${result.blocks} blocks, ${result.pins} pins, ${result.issues} issues, ${result.diary} diary events.`;
    });

  const exportJson = () =>
    void run('files', 'export-json', async () => {
      const farmName = getLastFarm()?.farmName;
      const { filename } = await downloadFarmExportJson(farmId, { farmName });
      return `Saved ${filename}`;
    });

  const exportXlsx = () =>
    void run('files', 'export-xlsx', async () => {
      const farmName = getLastFarm()?.farmName;
      const { filename } = await downloadFarmExportXlsx(farmId, { farmName });
      return `Saved ${filename}`;
    });

  const exportZip = (includePhotos: boolean) =>
    void run('files', 'export-zip', async () => {
      const farmName = getLastFarm()?.farmName;
      const { filename } = await downloadFarmExportZip(farmId, { farmName, includePhotos });
      return `Saved ${filename}`;
    });

  const cacheWeather = () =>
    void run('files', 'weather', async () => {
      const r = await cacheWeatherForOffline({ stationCode: defaultOfflineWeatherStation() });
      return `Cached ${r.stationCode} weather offline (${r.dayCount} days)`;
    });

  return {
    farmId,
    online,
    pending,
    lanMeta,
    weatherMeta,
    busy,
    note,
    peers,
    selectedPeer,
    hubLabel,
    scanSource,
    hubMissing,
    hubInfo,
    needsPairing,
    needsHub,
    gateway,
    gatewayInUse,
    gatewayIdentityChanged,
    /**
     * The gateway wants a code. Read off the saved gateway rather than the hub
     * currently in use, so the prompt does not appear in this card because the
     * *LAN* hub is unpaired.
     */
    gatewayNeedsPairing: Boolean(
      gateway && needsPairing && sameHubBase(selectedPeer, gateway.base),
    ),
    selectPeer,
    scanForHubs,
    setManualHubAddress,
    setGatewayAddress,
    pairGateway,
    forgetGateway,
    pair,
    pushToLan,
    pullFromLan,
    flushToCloud,
    exportPack,
    importPack,
    exportJson,
    exportXlsx,
    exportZip,
    cacheWeather,
  };
}

export type FarmSync = ReturnType<typeof useFarmSync>;

/** The note this card owns, or nothing — so an answer lands where it was asked. */
export function noteFor(sync: FarmSync, zone: SyncZone): SyncNote | null {
  return sync.note && sync.note.zone === zone ? sync.note : null;
}
