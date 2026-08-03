import React, { useCallback, useEffect, useState } from 'react';
import { Cloud, Database, FlaskConical, Loader2, Radio } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  getFarmStoreBackend,
  isMistExperimentalEnabled,
  setFarmStoreBackend,
  type FarmStoreBackendPreference,
} from '../mist/farmStoreBackend.ts';
import { readBonesWorkshopSmoke, runBonesWorkshopSmoke } from '../mist/bonesWorkshop.ts';
import {
  fetchFreenetPeerStatus,
  publishHotToFreenet,
  pullHotFromFreenet,
  startFreenetPeer,
  stopFreenetPeer,
  type FreenetPeerStatus,
} from '../mist/mistFreenetClient.ts';
import {
  formatEntityCounts,
  formatRehydrateResult,
  formatWipeResult,
  getLocalFarmEntityCounts,
  recoverLocalFarmFromFreenet,
  refreshFarmUiAfterRecovery,
  wipeLocalFarmForDisasterRecovery,
} from '../mist/mistDisasterRecovery.ts';
import {
  getMistHotPublishStatus,
  isMistHotMirrorAvailable,
  publishLocalFarmToMistHot,
  readMistHotCurrent,
  type MistHotPublishStatus,
} from '../mist/mistHotBridge.ts';

function freenetEndpointSummary(status: FreenetPeerStatus): string | undefined {
  return (
    status.endpoint ??
    (status.host && status.port != null ? `${status.host}:${status.port}` : undefined)
  );
}

function freenetDisconnectedHint(status: FreenetPeerStatus): string {
  const ep = freenetEndpointSummary(status);
  const isWs02 = status.transportId === 'ws02';
  if (isWs02) {
    return ep ? `Freenet 0.2 not reachable @ ${ep}` : 'Freenet 0.2 node not on :7509?';
  }
  return ep ? `Hyphanet FCP not reachable @ ${ep}` : 'Hyphanet not on :9481?';
}

function freenetStatusLabel(status: FreenetPeerStatus | null): string {
  if (!status?.running) return 'stopped';
  if (status.freenet === 'connected') {
    const ep = freenetEndpointSummary(status) ?? '';
    return ep
      ? `connected (${status.transportLabel ?? status.transportId ?? 'freenet'} @ ${ep})`
      : 'connected';
  }
  if (status.freenet === 'connecting') {
    const ep = freenetEndpointSummary(status);
    return ep ? `connecting to ${ep}…` : 'connecting…';
  }
  return `disconnected (${freenetDisconnectedHint(status)})`;
}

export function MistWorkshopCard() {
  const { userData } = useAuth();
  const farmId = userData?.farmId;
  const [backend, setBackend] = useState<FarmStoreBackendPreference>(() => getFarmStoreBackend());
  const [smokeBusy, setSmokeBusy] = useState(false);
  const [smokeResult, setSmokeResult] = useState<string | null>(null);
  const [hotStatus, setHotStatus] = useState<MistHotPublishStatus | null>(() =>
    farmId ? getMistHotPublishStatus(farmId) : null,
  );
  const [hotMirrorAvailable, setHotMirrorAvailable] = useState(() => isMistHotMirrorAvailable());
  const [freenetStatus, setFreenetStatus] = useState<FreenetPeerStatus | null>(null);
  const [freenetBusy, setFreenetBusy] = useState(false);

  const refreshFreenetStatus = useCallback(async () => {
    try {
      const status = await fetchFreenetPeerStatus();
      setFreenetStatus(status);
    } catch {
      setFreenetStatus(null);
    }
  }, []);

  useEffect(() => {
    setHotMirrorAvailable(isMistHotMirrorAvailable());
    if (farmId) setHotStatus(getMistHotPublishStatus(farmId));
    void refreshFreenetStatus();
  }, [farmId, backend, refreshFreenetStatus]);

  if (!isMistExperimentalEnabled() && backend !== 'mist') {
    return null;
  }

  const onBackendChange = (next: FarmStoreBackendPreference) => {
    setFarmStoreBackend(next);
    setBackend(next);
    setSmokeResult(null);
  };

  const runSmoke = async () => {
    if (!farmId) return;
    setSmokeBusy(true);
    setSmokeResult(null);
    try {
      const result = await runBonesWorkshopSmoke(farmId);
      setSmokeResult(
        result.roundTripOk
          ? `OK — put/get bones @ ${result.key} (hash ${result.contentHash.slice(0, 12)}…)`
          : 'Round-trip failed',
      );
    } catch (err) {
      setSmokeResult(err instanceof Error ? err.message : 'Smoke test failed');
    } finally {
      setSmokeBusy(false);
    }
  };

  const readSmoke = async () => {
    if (!farmId) return;
    setSmokeBusy(true);
    try {
      const result = await readBonesWorkshopSmoke(farmId);
      setSmokeResult(
        result
          ? `Read OK — ${result.payloadPreview}`
          : 'No workshop bones blob yet — run put/get first',
      );
    } catch (err) {
      setSmokeResult(err instanceof Error ? err.message : 'Read failed');
    } finally {
      setSmokeBusy(false);
    }
  };

  const publishHot = async () => {
    if (!farmId) return;
    setSmokeBusy(true);
    setSmokeResult(null);
    try {
      const result = await publishLocalFarmToMistHot(farmId);
      if (!result) {
        setSmokeResult('Hot mirror unavailable — unlock mist device session first');
        return;
      }
      setHotStatus(getMistHotPublishStatus(farmId));
      setSmokeResult(
        `Hot published — ${result.recordCount} records (${result.diaryCount} diary, ${result.issueCount}+${result.issueArchiveCount} issues) @ ${result.storageKey} · hash ${result.contentHash.slice(0, 12)}…${result.encrypted ? ' · AEAD' : ''}`,
      );
    } catch (err) {
      setSmokeResult(err instanceof Error ? err.message : 'Hot publish failed');
    } finally {
      setSmokeBusy(false);
    }
  };

  const readHot = async () => {
    if (!farmId) return;
    setSmokeBusy(true);
    try {
      const result = await readMistHotCurrent(farmId);
      if (!result) {
        setSmokeResult('No hot/current blob — publish local diary/issues first');
        return;
      }
      setSmokeResult(
        `Hot read OK — ${result.hot.records.length} records, window from ${result.hot.window_start.slice(0, 10)} · hash ${result.contentHash.slice(0, 12)}…`,
      );
    } catch (err) {
      setSmokeResult(err instanceof Error ? err.message : 'Hot read failed');
    } finally {
      setSmokeBusy(false);
    }
  };

  const connectFreenet = async () => {
    setFreenetBusy(true);
    setSmokeResult(null);
    try {
      const status = await startFreenetPeer({ contribute: false });
      setFreenetStatus(status);
      setSmokeResult(
        status.freenet === 'connected'
          ? `Freenet peer connected (${status.backendId})`
          : `Freenet peer started but ${freenetStatusLabel(status)}`,
      );
    } catch (err) {
      setSmokeResult(err instanceof Error ? err.message : 'Freenet connect failed');
    } finally {
      setFreenetBusy(false);
    }
  };

  const disconnectFreenet = async () => {
    setFreenetBusy(true);
    try {
      const status = await stopFreenetPeer();
      setFreenetStatus(status);
      setSmokeResult('Freenet peer stopped');
    } catch (err) {
      setSmokeResult(err instanceof Error ? err.message : 'Freenet disconnect failed');
    } finally {
      setFreenetBusy(false);
    }
  };

  const publishHotFreenet = async () => {
    if (!farmId) return;
    setFreenetBusy(true);
    setSmokeResult(null);
    try {
      const result = await publishHotToFreenet(farmId);
      setHotStatus(getMistHotPublishStatus(farmId));
      setSmokeResult(
        `Hot on Freenet — ${result.storageKey} · hash ${result.contentHash.slice(0, 12)}…${result.freenetPending ? ' · insert pending' : ''}${result.freenetUri ? ` · ${result.freenetUri.slice(0, 24)}…` : ''}`,
      );
      await refreshFreenetStatus();
    } catch (err) {
      setSmokeResult(err instanceof Error ? err.message : 'Freenet Hot publish failed');
    } finally {
      setFreenetBusy(false);
    }
  };

  const pullHotFreenet = async () => {
    if (!farmId) return;
    setFreenetBusy(true);
    setSmokeResult(null);
    try {
      const result = await pullHotFromFreenet(farmId);
      const readBack = await readMistHotCurrent(farmId);
      setSmokeResult(
        readBack
          ? `Pulled Hot from Freenet → local IndexedDB — ${readBack.hot.records.length} records · hash ${result.contentHash.slice(0, 12)}…`
          : `Pulled ciphertext · hash ${result.contentHash.slice(0, 12)}… (unlock session to decrypt)`,
      );
    } catch (err) {
      setSmokeResult(err instanceof Error ? err.message : 'Freenet Hot pull failed');
    } finally {
      setFreenetBusy(false);
    }
  };

  const showLocalCounts = async () => {
    if (!farmId) return;
    setSmokeBusy(true);
    try {
      const counts = await getLocalFarmEntityCounts(farmId);
      setSmokeResult(`Local pufom_farm_local — ${formatEntityCounts(counts)}`);
    } catch (err) {
      setSmokeResult(err instanceof Error ? err.message : 'Count failed');
    } finally {
      setSmokeBusy(false);
    }
  };

  const publishBackupToFreenet = async () => {
    if (!farmId) return;
    setFreenetBusy(true);
    setSmokeResult(null);
    try {
      const local = await publishLocalFarmToMistHot(farmId);
      if (!local) {
        setSmokeResult('Hot mirror unavailable — unlock mist device session first');
        return;
      }
      const remote = await publishHotToFreenet(farmId);
      setHotStatus(getMistHotPublishStatus(farmId));
      setSmokeResult(
        `Backup on Freenet — local ${local.recordCount} records → ${remote.storageKey} · hash ${remote.contentHash.slice(0, 12)}…${remote.freenetPending ? ' · insert pending' : ''}`,
      );
      await refreshFreenetStatus();
    } catch (err) {
      setSmokeResult(err instanceof Error ? err.message : 'Backup publish failed');
    } finally {
      setFreenetBusy(false);
    }
  };

  const simulateLocalLoss = async () => {
    if (!farmId) return;
    const ok = window.confirm(
      'Workshop disaster smoke: wipe local diary, issues, and mist Hot for this farm?\n\n' +
        'Kept: FarmCode, device session (FarmSeed), farm geometry.\n' +
        'Requires Freenet backup to recover.',
    );
    if (!ok) return;

    setSmokeBusy(true);
    setSmokeResult(null);
    try {
      const result = await wipeLocalFarmForDisasterRecovery(farmId, {
        clearHot: true,
        clearBonesWorkshop: false,
      });
      setHotStatus(null);
      await refreshFarmUiAfterRecovery(farmId);
      setSmokeResult(formatWipeResult(result));
    } catch (err) {
      setSmokeResult(err instanceof Error ? err.message : 'Local wipe failed');
    } finally {
      setSmokeBusy(false);
    }
  };

  const recoverFromFreenet = async () => {
    if (!farmId) return;
    setFreenetBusy(true);
    setSmokeResult(null);
    try {
      const result = await recoverLocalFarmFromFreenet(farmId);
      setHotStatus(getMistHotPublishStatus(farmId));
      await refreshFarmUiAfterRecovery(farmId);
      setSmokeResult(`${formatRehydrateResult(result)} · hash ${result.contentHash.slice(0, 12)}…`);
    } catch (err) {
      setSmokeResult(err instanceof Error ? err.message : 'Freenet recovery failed');
    } finally {
      setFreenetBusy(false);
    }
  };

  const freenetUp = freenetStatus?.running && freenetStatus.freenet === 'connected';
  const workshopBusy = smokeBusy || freenetBusy;

  return (
    <div className="bg-white p-6 rounded-2xl border border-violet-200 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-violet-50 rounded-xl text-violet-700">
          <FlaskConical className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Mist workshop (experimental)</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Phase 9 — IndexedDB + in-process Freenet peer (server transport). Firebase remains default for production farms.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onBackendChange('firebase')}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium ${
            backend === 'firebase'
              ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
              : 'border-slate-200 text-slate-600'
          }`}
        >
          <Cloud className="w-4 h-4" />
          Firebase (default)
        </button>
        <button
          type="button"
          onClick={() => onBackendChange('mist')}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium ${
            backend === 'mist'
              ? 'border-violet-500 bg-violet-50 text-violet-900'
              : 'border-slate-200 text-slate-600'
          }`}
        >
          <Database className="w-4 h-4" />
          Mist IndexedDB
        </button>
      </div>

      <div className="space-y-2 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-violet-600" />
          <p className="text-xs font-semibold text-slate-700">Freenet peer (in-process)</p>
        </div>
        <p className="text-[11px] text-slate-500">
          Transport runs inside this app&apos;s Node server. Default:{' '}
          <strong>Freenet 0.2</strong> WebSocket at{' '}
          <code className="font-mono">ws://127.0.0.1:7509/v1/contract/command</code>. Legacy Hyphanet
          FCP (<code className="font-mono">FREENET_TRANSPORT=fcp</code>, <code className="font-mono">:9481</code>)
          is opt-in.
        </p>
        <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
          Status:{' '}
          <span className="font-mono">{freenetStatusLabel(freenetStatus)}</span>
          {freenetStatus?.running ? (
            <>
              {' '}
              · transport={freenetStatus.transportId ?? '?'} · contribute=
              {String(freenetStatus.contribute)}
            </>
          ) : null}
          {freenetStatus?.lastError ? (
            <span className="block text-amber-700 mt-1">{freenetStatus.lastError}</span>
          ) : null}
        </p>
        <div className="flex flex-wrap gap-2">
          {!freenetStatus?.running ? (
            <button
              type="button"
              disabled={workshopBusy}
              onClick={() => void connectFreenet()}
              className="px-3 py-2 rounded-lg bg-violet-700 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {freenetBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Connect Freenet peer
            </button>
          ) : (
            <button
              type="button"
              disabled={workshopBusy}
              onClick={() => void disconnectFreenet()}
              className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
            >
              Disconnect peer
            </button>
          )}
          <button
            type="button"
            disabled={workshopBusy}
            onClick={() => void refreshFreenetStatus()}
            className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
          >
            Refresh status
          </button>
        </div>
      </div>

      {hotMirrorAvailable && farmId && (
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-700">Local → mist Hot</p>
          <p className="text-[11px] text-slate-500">
            Mirrors diary + issues from <code className="font-mono">pufom_farm_local</code> to{' '}
            <code className="font-mono text-[10px]">hot/current</code> (AEAD when FarmSeed unlocked).
            Auto-publish after local saves when mist session is active.
          </p>
          {hotStatus && (
            <p className="text-[11px] text-slate-600 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
              Last published {hotStatus.publishedAt.slice(0, 19)}Z — {hotStatus.recordCount} records · hash{' '}
              <span className="font-mono">{hotStatus.contentHash.slice(0, 16)}…</span>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={workshopBusy}
              onClick={() => void publishHot()}
              className="px-3 py-2 rounded-lg bg-violet-700 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {workshopBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Publish local diary/issues to mist Hot
            </button>
            <button
              type="button"
              disabled={workshopBusy}
              onClick={() => void readHot()}
              className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
            >
              Read Hot back (local)
            </button>
            <button
              type="button"
              disabled={workshopBusy || !freenetUp}
              title={freenetUp ? undefined : 'Connect Freenet peer first'}
              onClick={() => void publishHotFreenet()}
              className="px-3 py-2 rounded-lg bg-indigo-700 text-white text-xs font-semibold disabled:opacity-50"
            >
              Publish Hot to Freenet
            </button>
            <button
              type="button"
              disabled={workshopBusy || !freenetStatus?.running}
              title={freenetStatus?.running ? undefined : 'Start Freenet peer first'}
              onClick={() => void pullHotFreenet()}
              className="px-3 py-2 rounded-lg border border-indigo-200 text-xs font-semibold text-indigo-800"
            >
              Pull Hot from Freenet
            </button>
          </div>
        </div>
      )}

      {hotMirrorAvailable && farmId && (
        <div className="space-y-2 pt-2 border-t border-amber-100">
          <p className="text-xs font-semibold text-amber-900">Freenet loss / recovery smoke</p>
          <p className="text-[11px] text-slate-500">
            End-to-end: publish Hot to Freenet → simulate local loss → pull + rehydrate diary/issues.
            Freenet peer must be connected (<code className="font-mono">FREENET_TRANSPORT=ws02</code>, node on{' '}
            <code className="font-mono">localhost:7509</code>).
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={workshopBusy || !freenetUp}
              title={freenetUp ? undefined : 'Connect Freenet peer first'}
              onClick={() => void publishBackupToFreenet()}
              className="px-3 py-2 rounded-lg bg-amber-700 text-white text-xs font-semibold disabled:opacity-50"
            >
              1. Publish backup (Hot → Freenet)
            </button>
            <button
              type="button"
              disabled={workshopBusy}
              onClick={() => void simulateLocalLoss()}
              className="px-3 py-2 rounded-lg bg-red-700 text-white text-xs font-semibold disabled:opacity-50"
            >
              2. Simulate local loss
            </button>
            <button
              type="button"
              disabled={workshopBusy || !freenetStatus?.running}
              title={freenetStatus?.running ? undefined : 'Start Freenet peer first'}
              onClick={() => void recoverFromFreenet()}
              className="px-3 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
            >
              3. Recover from Freenet
            </button>
            <button
              type="button"
              disabled={workshopBusy}
              onClick={() => void showLocalCounts()}
              className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
            >
              Local counts
            </button>
          </div>
        </div>
      )}

      {backend === 'mist' && farmId && (
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <p className="text-[11px] text-slate-500">
            FarmId (derived): <code className="font-mono text-[10px]">{farmId}</code>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={workshopBusy}
              onClick={() => void runSmoke()}
              className="px-3 py-2 rounded-lg bg-violet-700 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {workshopBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Bones put/get smoke
            </button>
            <button
              type="button"
              disabled={workshopBusy}
              onClick={() => void readSmoke()}
              className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
            >
              Read last blob
            </button>
          </div>
        </div>
      )}

      {smokeResult && (
        <p className="text-[11px] font-mono text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 break-all">
          {smokeResult}
        </p>
      )}

      {backend === 'mist' && !farmId && (
        <p className="text-xs text-amber-700">Sign in to a mist farm to run workshop tests.</p>
      )}
    </div>
  );
}
