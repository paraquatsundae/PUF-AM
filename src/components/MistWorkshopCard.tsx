import React, { useCallback, useEffect, useState } from 'react';
import { Cloud, Copy, Database, FlaskConical, Loader2, Radio, Server } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getDesktopBridge } from '../lib/desktopBridge.ts';
import type { FreenetHostStatus } from '../../units/puf-freenet-host/src/types.ts';
import {
  getFarmStoreBackend,
  isMistExperimentalEnabled,
  setFarmStoreBackend,
  type FarmStoreBackendPreference,
} from '../mist/farmStoreBackend.ts';
import { readBonesWorkshopSmoke, runBonesWorkshopSmoke } from '../mist/bonesWorkshop.ts';
import {
  fetchFreenetPeerStatus,
  publishFarmToFreenet,
  publishHotToFreenet,
  pullHotFromFreenet,
  pullHotFromFreenetByUri,
  startFreenetPeer,
  stopFreenetPeer,
  type FreenetPeerStatus,
} from '../mist/mistFreenetClient.ts';
import {
  fetchAndRehydrateFarmFromFreenet,
  formatEntityCounts,
  formatRehydrateResult,
  formatWipeResult,
  getLocalFarmEntityCounts,
  recoverLocalFarmFromFreenet,
  refreshFarmUiAfterRecovery,
  wipeLocalFarmForDisasterRecovery,
} from '../mist/mistDisasterRecovery.ts';
import { formatJoinTicket } from '../mist/mistJoinTicket.ts';
import { getMistFreenetApiBaseUrl, usesLocalFreenetSidecar } from '../lib/apiBase.ts';
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

/** The app-owned node child process, not the client transport talking to it. */
function freenetHostLabel(status: FreenetHostStatus | null): string {
  if (!status) return 'unknown';
  const bits: string[] = [status.mode];
  bits.push(status.reachable ? `reachable @ ${status.wsHost}:${status.wsPort}` : 'not reachable');
  if (status.binary?.source) bits.push(`binary=${status.binary.source}`);
  if (status.pid) bits.push(`pid ${status.pid}`);
  return bits.join(' · ');
}

function checkedAtLabel(): string {
  return new Date().toLocaleTimeString();
}

/**
 * Operators read the node's own "External address" line and expect that UDP port
 * here. It is a different socket for a different job, so spell both out rather
 * than leave a mismatch looking like a misconfiguration.
 */
function FreenetPortRoles() {
  return (
    <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
      <span className="font-semibold text-slate-700">Two different ports — a mismatch is normal.</span>{' '}
      <code className="font-mono text-[10px]">127.0.0.1:7509</code> is the node&apos;s local
      WebSocket API: the only port PUF-AM talks to, and it never leaves this machine. The{' '}
      <strong>External address</strong> UDP port your Freenet client shows (e.g.{' '}
      <code className="font-mono text-[10px]">35712</code>) is the peer-to-peer Opennet socket other
      peers reach you on. They are unrelated numbers and will not match.
    </p>
  );
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
  const [hostStatus, setHostStatus] = useState<FreenetHostStatus | null>(null);
  const [hostBusy, setHostBusy] = useState(false);
  const [pasteUri, setPasteUri] = useState('');
  const [joinTicket, setJoinTicket] = useState('');
  const [uriCopied, setUriCopied] = useState(false);
  const [ticketCopied, setTicketCopied] = useState(false);

  const lastFreenetUri = hotStatus?.freenetUri;
  const lastBonesUri = hotStatus?.bonesFreenetUri;

  const refreshFreenetStatus = useCallback(async () => {
    try {
      const status = await fetchFreenetPeerStatus();
      setFreenetStatus(status);
      return status;
    } catch {
      setFreenetStatus(null);
      return null;
    }
  }, []);

  const refreshHostStatus = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge) return null;
    const status = await bridge.freenet.status();
    setHostStatus(status);
    return status;
  }, []);

  useEffect(() => {
    setHotMirrorAvailable(isMistHotMirrorAvailable());
    if (farmId) setHotStatus(getMistHotPublishStatus(farmId));
    void refreshFreenetStatus();
  }, [farmId, backend, refreshFreenetStatus]);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    refreshHostStatus().catch(() => setHostStatus(null));
    return bridge.freenet.onState(setHostStatus);
  }, [refreshHostStatus]);

  if (!isMistExperimentalEnabled() && backend !== 'mist') {
    return null;
  }

  const desktop = getDesktopBridge();

  const freenetSidecar = usesLocalFreenetSidecar();
  const freenetApiBase = getMistFreenetApiBaseUrl();

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

  /**
   * A status read that changes nothing looks identical to a dead button, so the
   * refresh actions always report what they saw and when they saw it.
   */
  const onRefreshHostStatus = async () => {
    setHostBusy(true);
    setSmokeResult(null);
    try {
      const status = await refreshHostStatus();
      setSmokeResult(
        status
          ? `Node re-checked ${checkedAtLabel()} — ${freenetHostLabel(status)}`
          : 'Node status unavailable — desktop shell only',
      );
    } catch (err) {
      setSmokeResult(err instanceof Error ? err.message : 'Node status refresh failed');
    } finally {
      setHostBusy(false);
    }
  };

  const onRefreshPeerStatus = async () => {
    setFreenetBusy(true);
    setSmokeResult(null);
    try {
      const status = await refreshFreenetStatus();
      setSmokeResult(
        status
          ? `Peer re-checked ${checkedAtLabel()} — ${freenetStatusLabel(status)}`
          : 'Peer status unreachable — is the mist Freenet API running?',
      );
    } finally {
      setFreenetBusy(false);
    }
  };

  const startFreenetNode = async () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    setHostBusy(true);
    setSmokeResult(null);
    try {
      const status = await bridge.freenet.start();
      setHostStatus(status);
      setSmokeResult(
        status?.reachable
          ? `Freenet node ${status.mode} on ${status.wsHost}:${status.wsPort} — now connect the peer`
          : `Freenet node ${status?.mode ?? 'unavailable'}${status?.lastError ? ` — ${status.lastError}` : ''}`,
      );
      await refreshFreenetStatus();
    } catch (err) {
      setSmokeResult(err instanceof Error ? err.message : 'Freenet node start failed');
    } finally {
      setHostBusy(false);
    }
  };

  const stopFreenetNode = async () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    setHostBusy(true);
    try {
      const status = await bridge.freenet.stop();
      setHostStatus(status);
      setSmokeResult('Freenet node stopped');
      await refreshFreenetStatus();
    } catch (err) {
      setSmokeResult(err instanceof Error ? err.message : 'Freenet node stop failed');
    } finally {
      setHostBusy(false);
    }
  };

  const connectFreenet = async () => {
    setFreenetBusy(true);
    setSmokeResult(null);
    try {
      const status = await startFreenetPeer({ contribute: false });
      setFreenetStatus(status);
      if (status.freenet === 'connected') {
        setSmokeResult(
          status.lastError
            ? `Freenet peer connected (${status.backendId}) — note: ${status.lastError}`
            : `Freenet peer connected (${status.backendId})`,
        );
      } else {
        setSmokeResult(`Freenet peer started but ${freenetStatusLabel(status)}`);
      }
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
        result.freenetUri
          ? `Hot on Freenet — copy URI below for laptop B · hash ${result.contentHash.slice(0, 12)}…${result.freenetPending ? ' · insert pending' : ''}`
          : `Hot on Freenet — ${result.storageKey} · hash ${result.contentHash.slice(0, 12)}…${result.freenetPending ? ' · insert pending' : ''}`,
      );
      await refreshFreenetStatus();
    } catch (err) {
      setSmokeResult(err instanceof Error ? err.message : 'Freenet Hot publish failed');
    } finally {
      setFreenetBusy(false);
    }
  };

  const copyFreenetUri = async () => {
    if (!lastFreenetUri) return;
    try {
      await navigator.clipboard.writeText(lastFreenetUri);
      setUriCopied(true);
      setTimeout(() => setUriCopied(false), 2000);
    } catch {
      setSmokeResult('Clipboard copy failed — select and copy the URI manually');
    }
  };

  const copyJoinTicket = async () => {
    const text =
      joinTicket ||
      (lastFreenetUri && lastBonesUri
        ? formatJoinTicket({
            v: 1,
            hotUri: lastFreenetUri,
            bonesUri: lastBonesUri,
            hotContentHash: hotStatus?.contentHash,
            bonesContentHash: hotStatus?.bonesContentHash,
          })
        : '');
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setTicketCopied(true);
      setTimeout(() => setTicketCopied(false), 2000);
    } catch {
      setSmokeResult('Clipboard copy failed — select and copy the join ticket manually');
    }
  };

  const publishFarmFreenet = async () => {
    if (!farmId) return;
    setFreenetBusy(true);
    setSmokeResult(null);
    try {
      const result = await publishFarmToFreenet(farmId);
      setHotStatus(getMistHotPublishStatus(farmId));
      setJoinTicket(result.joinTicketText);
      setSmokeResult(
        `Farm on Freenet — Hot ${result.hot.contentHash.slice(0, 12)}… + bones ${result.bones.contentHash.slice(0, 12)}… · copy join ticket below`,
      );
      await refreshFreenetStatus();
    } catch (err) {
      setSmokeResult(err instanceof Error ? err.message : 'Publish farm to Freenet failed');
    } finally {
      setFreenetBusy(false);
    }
  };

  const fetchFarmFreenet = async () => {
    if (!farmId || !pasteUri.trim()) return;
    setFreenetBusy(true);
    setSmokeResult(null);
    try {
      const result = await fetchAndRehydrateFarmFromFreenet(farmId, pasteUri.trim());
      setHotStatus(getMistHotPublishStatus(farmId));
      await refreshFarmUiAfterRecovery(farmId);
      setSmokeResult(
        `${formatRehydrateResult(result.hot)} · geometry ${result.geometry.before.blocks}→${result.geometry.after.blocks} blocks, ${result.geometry.before.pins}→${result.geometry.after.pins} pins`,
      );
    } catch (err) {
      setSmokeResult(err instanceof Error ? err.message : 'Fetch farm from Freenet failed');
    } finally {
      setFreenetBusy(false);
    }
  };

  const pullHotFreenetByUri = async () => {
    if (!farmId || !pasteUri.trim()) return;
    setFreenetBusy(true);
    setSmokeResult(null);
    try {
      const result = await pullHotFromFreenetByUri(farmId, pasteUri.trim(), hotStatus?.contentHash);
      setHotStatus(getMistHotPublishStatus(farmId));
      const readBack = await readMistHotCurrent(farmId);
      setSmokeResult(
        readBack
          ? `Pulled Hot by URI → local IndexedDB — ${readBack.hot.records.length} records · hash ${result.contentHash.slice(0, 12)}…`
          : `Pulled ciphertext by URI · hash ${result.contentHash.slice(0, 12)}… (unlock session to decrypt)`,
      );
    } catch (err) {
      setSmokeResult(err instanceof Error ? err.message : 'Pull by URI failed');
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
      const uri = pasteUri.trim() || lastFreenetUri;
      const result = await recoverLocalFarmFromFreenet(farmId, undefined, {
        freenetUri: uri || undefined,
        contentHash: hotStatus?.contentHash,
      });
      setHotStatus(getMistHotPublishStatus(farmId));
      await refreshFarmUiAfterRecovery(farmId);
      setSmokeResult(`${formatRehydrateResult(result)} · hash ${result.contentHash.slice(0, 12)}…`);
    } catch (err) {
      setSmokeResult(err instanceof Error ? err.message : 'Freenet recovery failed');
    } finally {
      setFreenetBusy(false);
    }
  };

  const freenetConnected = freenetStatus?.freenet === 'connected';
  const freenetUp = freenetStatus?.running && freenetConnected;
  const workshopBusy = smokeBusy || freenetBusy || hostBusy;
  const hostRunning = hostStatus?.mode === 'managed' || hostStatus?.mode === 'attached';

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

      {desktop && (
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-violet-600" />
            <p className="text-xs font-semibold text-slate-700">Freenet node (app-owned)</p>
          </div>
          <p className="text-[11px] text-slate-500">
            This app owns the node process — no terminal, no separate{' '}
            <code className="font-mono text-[10px]">freenet network</code>. Launching with{' '}
            <code className="font-mono text-[10px]">MIST_FREENET=1</code> starts it automatically;
            otherwise start it here for this session.
          </p>
          <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
            Node: <span className="font-mono">{freenetHostLabel(hostStatus)}</span>
            {hostStatus?.updateRequired ? (
              <span className="block text-amber-700 mt-1">
                Node asked for an update (exit 42) — bundled binary left as-is.
              </span>
            ) : null}
            {hostStatus?.lastError ? (
              <span className="block text-amber-700 mt-1">{hostStatus.lastError}</span>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-2">
            {!hostRunning ? (
              <button
                type="button"
                disabled={workshopBusy}
                onClick={() => void startFreenetNode()}
                className="px-3 py-2 rounded-lg bg-violet-700 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {hostBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Start Freenet node
              </button>
            ) : (
              <button
                type="button"
                disabled={workshopBusy || hostStatus?.mode === 'attached'}
                title={
                  hostStatus?.mode === 'attached'
                    ? 'Node was already running — this app must not kill it'
                    : undefined
                }
                onClick={() => void stopFreenetNode()}
                className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 disabled:opacity-50"
              >
                Stop Freenet node
              </button>
            )}
            <button
              type="button"
              disabled={workshopBusy}
              onClick={() => void onRefreshHostStatus()}
              className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {hostBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Refresh node status
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-violet-600" />
          <p className="text-xs font-semibold text-slate-700">Freenet peer (in-process)</p>
        </div>
        <p className="text-[11px] text-slate-500">
          Transport runs inside this app&apos;s Node server. Default:{' '}
          <strong>Freenet 0.2</strong> WebSocket at{' '}
          <code className="font-mono text-[10px]">127.0.0.1:7509</code> (ws02). Legacy Hyphanet FCP
          at <code className="font-mono text-[10px]">127.0.0.1:9481</code> when{' '}
          <code className="font-mono text-[10px]">FREENET_TRANSPORT=fcp</code>.
        </p>
        {freenetSidecar ? (
          <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Production UI — Freenet API calls go to local sidecar{' '}
            <code className="font-mono text-[10px]">{freenetApiBase}</code>. On this laptop run{' '}
            <code className="font-mono text-[10px]">freenet network</code> plus{' '}
            <code className="font-mono text-[10px]">
              FREENET_TRANSPORT=ws02 MIST_FREENET=1 npm run dev
            </code>{' '}
            (laptop A also needs <code className="font-mono text-[10px]">fdev</code> for publish).
          </p>
        ) : null}
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
            // Connected peers still carry the last wire message. Shown as a note so
            // a stale or outbox-only complaint does not read as a failed connect.
            <span
              className={`block mt-1 ${freenetConnected ? 'text-slate-500' : 'text-amber-700'}`}
            >
              {freenetConnected ? 'Note: ' : ''}
              {freenetStatus.lastError}
            </span>
          ) : null}
        </p>
        <FreenetPortRoles />
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
            onClick={() => void onRefreshPeerStatus()}
            className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {freenetBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Refresh status
          </button>
        </div>
      </div>

      {hotMirrorAvailable && farmId && (
        <div className="space-y-2 pt-2 border-t border-emerald-100">
          <p className="text-xs font-semibold text-emerald-900">Two-laptop Freenet sync (A → B)</p>
          <p className="text-[11px] text-slate-500">
            Laptop A: draw boundaries + diary, then <strong>Publish farm to Freenet</strong> (Hot + bones).
            Copy the join ticket. Laptop B: recover FarmCode → Connect peer → paste ticket →{' '}
            <strong>Fetch farm from Freenet</strong>.
          </p>
          {(joinTicket || (lastFreenetUri && lastBonesUri)) ? (
            <div className="text-[11px] bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 space-y-1.5">
              <p className="font-semibold text-emerald-900">Join ticket (copy for laptop B)</p>
              <pre className="font-mono break-all text-emerald-800 whitespace-pre-wrap text-[10px] max-h-32 overflow-auto">
                {joinTicket ||
                  formatJoinTicket({
                    v: 1,
                    hotUri: lastFreenetUri!,
                    bonesUri: lastBonesUri!,
                    hotContentHash: hotStatus?.contentHash,
                    bonesContentHash: hotStatus?.bonesContentHash,
                  })}
              </pre>
              <button
                type="button"
                disabled={workshopBusy}
                onClick={() => void copyJoinTicket()}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-emerald-200 text-emerald-800 text-[10px] font-semibold"
              >
                <Copy className="w-3 h-3" />
                {ticketCopied ? 'Copied' : 'Copy join ticket'}
              </button>
            </div>
          ) : null}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-600" htmlFor="mist-join-ticket-paste">
              Paste join ticket (laptop B)
            </label>
            <textarea
              id="mist-join-ticket-paste"
              rows={4}
              value={pasteUri}
              onChange={(e) => setPasteUri(e.target.value)}
              placeholder={'JSON { "v": 1, "hotUri": "FN02@…", "bonesUri": "FN02@…" }\nor two lines: hot URI then bones URI'}
              className="w-full text-[11px] font-mono px-2 py-1.5 rounded border border-slate-200"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={workshopBusy || !freenetUp}
              title={freenetUp ? undefined : 'Connect Freenet peer first'}
              onClick={() => void publishFarmFreenet()}
              className="px-3 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
            >
              Publish farm to Freenet (Hot + bones)
            </button>
            <button
              type="button"
              disabled={workshopBusy || !freenetStatus?.running || !pasteUri.trim()}
              title={
                !pasteUri.trim()
                  ? 'Paste join ticket from laptop A first'
                  : freenetStatus?.running
                    ? undefined
                    : 'Start Freenet peer first'
              }
              onClick={() => void fetchFarmFreenet()}
              className="px-3 py-2 rounded-lg border border-emerald-300 text-xs font-semibold text-emerald-900 bg-emerald-50"
            >
              Fetch farm from Freenet
            </button>
          </div>
        </div>
      )}

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
              {hotStatus.freenetUri ? (
                <>
                  {' '}
                  · Freenet{' '}
                  {hotStatus.freenetPublishedAt
                    ? hotStatus.freenetPublishedAt.slice(0, 19) + 'Z'
                    : 'published'}
                </>
              ) : null}
            </p>
          )}
          {lastFreenetUri && lastBonesUri ? (
            <div className="text-[11px] bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 space-y-1">
              <p className="font-semibold text-indigo-900">Individual URIs (legacy handoff)</p>
              <p className="font-mono break-all text-indigo-800 text-[10px]">Hot: {lastFreenetUri}</p>
              <p className="font-mono break-all text-indigo-800 text-[10px]">Bones: {lastBonesUri}</p>
            </div>
          ) : lastFreenetUri ? (
            <div className="text-[11px] bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 space-y-1.5">
              <p className="font-semibold text-indigo-900">Hot Freenet URI (copy for laptop B)</p>
              <p className="font-mono break-all text-indigo-800">{lastFreenetUri}</p>
              <button
                type="button"
                disabled={workshopBusy}
                onClick={() => void copyFreenetUri()}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-indigo-200 text-indigo-800 text-[10px] font-semibold"
              >
                <Copy className="w-3 h-3" />
                {uriCopied ? 'Copied' : 'Copy URI'}
              </button>
            </div>
          ) : null}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-600" htmlFor="mist-freenet-uri-paste">
              Paste Hot FN02 URI (laptop B — empty index)
            </label>
            <input
              id="mist-freenet-uri-paste"
              type="text"
              value={pasteUri}
              onChange={(e) => setPasteUri(e.target.value)}
              placeholder="FN02@… or bare base58 contract id from laptop A"
              className="w-full text-[11px] font-mono px-2 py-1.5 rounded border border-slate-200"
            />
          </div>
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
            <button
              type="button"
              disabled={workshopBusy || !freenetStatus?.running || !pasteUri.trim()}
              title={
                !pasteUri.trim()
                  ? 'Paste FN02 URI from laptop A first'
                  : freenetStatus?.running
                    ? undefined
                    : 'Start Freenet peer first'
              }
              onClick={() => void pullHotFreenetByUri()}
              className="px-3 py-2 rounded-lg border border-indigo-300 text-xs font-semibold text-indigo-900 bg-indigo-50"
            >
              Pull Hot by URI
            </button>
          </div>
        </div>
      )}

      {hotMirrorAvailable && farmId && (
        <div className="space-y-2 pt-2 border-t border-amber-100">
          <p className="text-xs font-semibold text-amber-900">Freenet loss / recovery smoke</p>
          <p className="text-[11px] text-slate-500">
            End-to-end: publish Hot to Freenet → simulate local loss → pull + rehydrate diary/issues.
            Two-laptop: copy <strong>FN02 URI</strong> on A, paste on B, then <strong>Pull Hot by URI</strong> or step 3.
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
