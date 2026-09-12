/**
 * Settings → Plugins → Freenet, for a **cloud** farm on a capable shell.
 *
 * The hybrid enable flow of Plans/FREENET_NETWORK_PACK.md §3, rendered inside
 * the plugin tile. Four honest states, decided by the farm doc and by whether
 * this device holds the seed:
 *
 *  - mirror on, seed here          → toggle (admins) and "Open Sync";
 *  - mirror on, no seed here       → "enter the FarmCode to take part";
 *  - mirror off, admin             → enable: mint FarmCode (shown once), optional
 *                                    device PIN, seal seed, write the farm doc;
 *  - mirror off, not admin         → one line saying who can turn it on.
 *
 * The FarmCode screen is the same pattern as `MistNewFarm` — shown once, never
 * printed again, written down before Continue is allowed — and the enable copy
 * says what the plan's Hole 4 says: anyone holding the FarmCode reads the whole
 * mirror whatever their cloud role, and revoking a ticket takes nothing back.
 */

import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Loader2, ShieldAlert } from 'lucide-react';

import {
  FARM_CODE_BODY_LEN,
  FARM_CODE_VERSION,
  mintFarmCode,
  parseFarmCode,
  type ParsedFarmCode,
} from '../../../units/mist-freenet/src/index.ts';
import { farmFreenetHostState } from '../../../shared/farm/networkPacks';
import { useAuth } from '../../../src/contexts/AuthContext';
import { getLastFarm } from '../../../src/lib/deviceSession';
import { mirroredCloudFarmId } from '../../../src/lib/farmPipes';
import { getMistSessionMeta } from '../../../src/mist/mistDeviceSession.ts';
import {
  hybridSeedWouldReplaceExisting,
  sealHybridSeedOnThisDevice,
  subscribeFreenetHybridDevice,
  writeFreenetHostFarmDoc,
} from './freenetHostCloud.ts';
import { DevicePinFields } from './DevicePinFields';
import { FreenetEnterFarmCode } from './FreenetEnterFarmCode';

type Props = { farmId: string; onOpenSync?: () => void };

type Flow = 'idle' | 'show-code' | 'device-pin' | 'enter-code';

const RISK_COPY =
  'Anyone who holds the FarmCode can read the whole mirror, whatever their role on the cloud ' +
  'farm. Revoking a join ticket stops new devices; it does not take a copy back from one that ' +
  'already pulled it. Only a new FarmCode does that.';

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
      {error}
    </div>
  );
}

export function FreenetHybridEnable({ farmId, onOpenSync }: Props) {
  const { user, userData, isAdmin, farmNetworkPacks } = useAuth();
  const state = farmFreenetHostState(farmNetworkPacks);
  const [, setTick] = useState(0);
  useEffect(() => subscribeFreenetHybridDevice(() => setTick((n) => n + 1)), []);
  const seedHere = mirroredCloudFarmId() === farmId;

  const [flow, setFlow] = useState<Flow>('idle');
  const [farmCode, setFarmCode] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedFarmCode | null>(null);
  const [confirmedWritten, setConfirmedWritten] = useState(false);
  const [confirmedReplace, setConfirmedReplace] = useState(false);
  const [copied, setCopied] = useState(false);
  const [devicePin, setDevicePin] = useState('');
  const [skipPin, setSkipPin] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const replacing = hybridSeedWouldReplaceExisting() && !seedHere;
  const existingSeedName = replacing ? getMistSessionMeta()?.farmName : undefined;
  const pinOk = skipPin || devicePin.length === 4;
  const uid = user?.uid ?? userData?.uid ?? '';

  const reset = () => {
    setFlow('idle');
    setFarmCode(null);
    setParsed(null);
    setConfirmedWritten(false);
    setConfirmedReplace(false);
    setDevicePin('');
    setSkipPin(true);
    setError(null);
  };

  const startMint = async () => {
    setBusy(true);
    setError(null);
    try {
      const code = await mintFarmCode();
      setFarmCode(code);
      setParsed(await parseFarmCode(code));
      setFlow('show-code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mint a FarmCode');
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    if (!farmCode) return;
    await navigator.clipboard.writeText(farmCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /** Seal a newly minted seed (once) and write the farm doc. */
  const finishMint = async () => {
    if (!parsed || !uid) return;
    setBusy(true);
    setError(null);
    try {
      // A failed farm-doc write after a successful seal must not mint again.
      if (mirroredCloudFarmId() !== farmId) {
        await sealHybridSeedOnThisDevice({
          cloudFarmId: farmId,
          farmName: getLastFarm()?.farmName ?? farmId,
          displayName: userData?.displayName ?? '',
          parsed,
          devicePin: skipPin ? undefined : devicePin,
          role: isAdmin ? 'owner' : 'farmer',
        });
      }
      await writeFreenetHostFarmDoc(farmId, {
        enabled: true,
        mistFarmId: parsed.farmId,
        current: state,
        changedBy: uid,
      });
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn the Freenet mirror on');
    } finally {
      setBusy(false);
    }
  };

  /** Idle retry: seed is already here, farm doc never got the mist id. */
  const retryEnableFromSealedSeed = async () => {
    const mistFarmId = getMistSessionMeta()?.farmId;
    if (!uid || !mistFarmId || !seedHere) return;
    setBusy(true);
    setError(null);
    try {
      await writeFreenetHostFarmDoc(farmId, {
        enabled: true,
        mistFarmId,
        current: state,
        changedBy: uid,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn the Freenet mirror on');
    } finally {
      setBusy(false);
    }
  };

  const setEnabled = async (enabled: boolean) => {
    if (!uid) return;
    setBusy(true);
    setError(null);
    try {
      await writeFreenetHostFarmDoc(farmId, { enabled, current: state, changedBy: uid });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the farm');
    } finally {
      setBusy(false);
    }
  };

  // --- FarmCode shown once ---------------------------------------------------
  if (flow === 'show-code' && farmCode) {
    const [versionLabel, body] = farmCode.split(/\s{2,}/);
    return (
      <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
        <div className="flex items-start gap-2 text-amber-900">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-snug">
            <strong>Write this down — shown once.</strong> This FarmCode is the key to the Freenet
            mirror of this cloud farm. It is not your login and it is never shown again. {RISK_COPY}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-2.5">
          <p className="font-mono text-[10px] text-slate-500">{versionLabel}</p>
          <code
            className="block font-mono text-base font-semibold leading-relaxed tracking-[0.1em] text-slate-900 whitespace-pre-wrap break-words select-all"
            title={farmCode}
          >
            {body}
          </code>
        </div>
        <p className="text-[10px] text-slate-500">
          {FARM_CODE_BODY_LEN} letters and numbers in groups of five; the{' '}
          <code className="font-mono">{FARM_CODE_VERSION}</code> label is the format, not the secret.
        </p>
        <button
          type="button"
          onClick={() => void copyCode()}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[11px]"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          Copy (discouraged — prefer paper)
        </button>
        <label className="flex items-start gap-2 text-[11px] text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={confirmedWritten}
            onChange={(e) => setConfirmedWritten(e.target.checked)}
          />
          <span>I have written this FarmCode down and stored it safely offline</span>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!confirmedWritten}
            onClick={() => setFlow('device-pin')}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold disabled:opacity-50"
          >
            Continue
          </button>
          <button type="button" onClick={reset} className="px-3 py-1.5 text-[11px] text-slate-600">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // --- Optional device PIN, then seal + farm doc ----------------------------
  if (flow === 'device-pin' && parsed) {
    return (
      <div className="space-y-2 rounded-xl border border-slate-200 p-3">
        <p className="text-[11px] text-slate-700">
          <strong>Optional device PIN.</strong> The mirror key is sealed on this device either way.
        </p>
        <DevicePinFields
          skipPin={skipPin}
          setSkipPin={setSkipPin}
          devicePin={devicePin}
          setDevicePin={setDevicePin}
        />
        {replacing && (
          <label className="flex items-start gap-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={confirmedReplace}
              onChange={(e) => setConfirmedReplace(e.target.checked)}
            />
            <span>
              This device already holds a Freenet key{existingSeedName ? ` for ${existingSeedName}` : ''}.
              A device keeps one; continuing replaces it. That farm stays recoverable with its own
              paper FarmCode.
            </span>
          </label>
        )}
        <ErrorLine error={error} />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || !pinOk || (replacing && !confirmedReplace)}
            onClick={() => void finishMint()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-semibold disabled:opacity-50"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Turn the Freenet mirror on
          </button>
          <button type="button" onClick={reset} className="px-3 py-1.5 text-[11px] text-slate-600">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (flow === 'enter-code') {
    return <FreenetEnterFarmCode farmId={farmId} onCancel={reset} onDone={reset} />;
  }

  // --- Idle: read the farm doc and this device ------------------------------
  const enabled = state?.enabled === true;
  return (
    <div className="space-y-2">
      {enabled && seedHere && (
        <p className="text-[11px] text-slate-700">
          The Freenet mirror is on and this device holds its key. <strong>Send this farm</strong>{' '}
          under Sync seals what this device has loaded and publishes it.
        </p>
      )}
      {enabled && !seedHere && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-slate-700">
            <strong>Freenet mirror is on for this farm</strong> — enter the FarmCode to take part from
            this device.
          </p>
          <button
            type="button"
            onClick={() => setFlow('enter-code')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-[11px] font-semibold"
          >
            <KeyRound className="w-3.5 h-3.5" /> Enter the FarmCode
          </button>
        </div>
      )}
      {!enabled && !isAdmin && (
        <p className="text-[10px] text-slate-500">
          Off for this farm. Only a farm admin can turn the Freenet mirror on.
        </p>
      )}
      {!enabled && isAdmin && !state?.mistFarmId && seedHere && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-slate-600 leading-snug">
            This device already holds the mirror key. The farm doc write did not finish — retry
            without minting a new FarmCode.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void retryEnableFromSealedSeed()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold disabled:opacity-50"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Finish turning the mirror on
          </button>
        </div>
      )}
      {!enabled && isAdmin && !state?.mistFarmId && !seedHere && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-slate-600 leading-snug">
            Keeps a sealed copy of this farm on Freenet, published when you press{' '}
            <strong>Send this farm</strong>. Firestore stays the authority; the mirror is for
            reading and for getting the farm back if the cloud copy is lost. {RISK_COPY}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void startMint()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold disabled:opacity-50"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Enable the Freenet mirror
          </button>
        </div>
      )}
      {!enabled && isAdmin && state?.mistFarmId && !seedHere && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-slate-600 leading-snug">
            The mirror is off. Its FarmCode still works — enter it here to turn the mirror back on
            at the same address. Lost it? Start a new mirror with a new code.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFlow('enter-code')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-[11px] font-semibold"
            >
              <KeyRound className="w-3.5 h-3.5" /> Enter the FarmCode
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void startMint()}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-600 hover:text-slate-900"
            >
              Start a new mirror
            </button>
          </div>
        </div>
      )}
      {isAdmin && state?.mistFarmId && (enabled || seedHere) && (
        <label className="flex items-start gap-2 text-[11px] text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5 accent-emerald-700"
            checked={enabled}
            disabled={busy}
            onChange={(e) => void setEnabled(e.target.checked)}
          />
          <span>
            Freenet mirror on for this farm.{' '}
            <span className="text-slate-500">
              Turning it off stops this device&apos;s node and keeps the mirror address, so the same
              FarmCode turns it back on.
            </span>
          </span>
        </label>
      )}
      <ErrorLine error={error} />
      {enabled && seedHere && onOpenSync && (
        <button
          type="button"
          onClick={onOpenSync}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-[11px] font-semibold"
        >
          Open Sync
        </button>
      )}
    </div>
  );
}
