/**
 * Type an existing FarmCode on a hybrid farm — tile and post-sign-in prompt.
 * Does not render the code back. `Plans/LOGIN_JOIN_SINGLE_BOX.md` §2.6.
 */
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  FARM_CODE_BODY_LEN,
  FarmCodeError,
  farmCodeSymbolCount,
  parseFarmCode,
  type ParsedFarmCode,
} from '../../../units/mist-freenet/src/index.ts';
import { farmFreenetHostState } from '../../../shared/farm/networkPacks';
import { useAuth } from '../../../src/contexts/AuthContext';
import { getLastFarm } from '../../../src/lib/deviceSession';
import {
  hybridSeedWouldReplaceExisting,
  sealHybridSeedOnThisDevice,
  writeFreenetHostFarmDoc,
} from './freenetHostCloud.ts';
import { getMistSessionMeta } from '../../../src/mist/mistDeviceSession.ts';
import { DevicePinFields } from './DevicePinFields';
import { FarmCodeField } from './FarmCodeField';

const RISK_COPY =
  'Anyone who holds the FarmCode can read the whole mirror, whatever their role on the cloud ' +
  'farm. Revoking a join ticket stops new devices; it does not take a copy back from one that ' +
  'already pulled it. Only a new FarmCode does that.';

export function FreenetEnterFarmCode({
  farmId,
  onCancel,
  onDone,
}: {
  farmId: string;
  onCancel: () => void;
  onDone?: () => void;
}) {
  const { user, userData, isAdmin, farmNetworkPacks } = useAuth();
  const state = farmFreenetHostState(farmNetworkPacks);
  const [step, setStep] = useState<'code' | 'pin'>('code');
  const [codeInput, setCodeInput] = useState('');
  const [parsed, setParsed] = useState<ParsedFarmCode | null>(null);
  const [devicePin, setDevicePin] = useState('');
  const [skipPin, setSkipPin] = useState(true);
  const [confirmedReplace, setConfirmedReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const replacing = hybridSeedWouldReplaceExisting();
  const existingSeedName = replacing ? getMistSessionMeta()?.farmName : undefined;
  const pinOk = skipPin || devicePin.length === 4;
  const uid = user?.uid ?? userData?.uid ?? '';
  const typed = farmCodeSymbolCount(codeInput);

  const parseTyped = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setParsed(await parseFarmCode(codeInput));
      setStep('pin');
    } catch (err) {
      setError(
        err instanceof FarmCodeError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not read that FarmCode',
      );
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (!parsed || !uid) return;
    setBusy(true);
    setError(null);
    try {
      if (state?.mistFarmId && parsed.farmId !== state.mistFarmId) {
        throw new Error(
          'That FarmCode belongs to a different mirror than the one this farm is set up with. ' +
            'Check the code with the farm owner.',
        );
      }
      await sealHybridSeedOnThisDevice({
        cloudFarmId: farmId,
        farmName: getLastFarm()?.farmName ?? farmId,
        displayName: userData?.displayName ?? '',
        parsed,
        devicePin: skipPin ? undefined : devicePin,
        role: isAdmin ? 'owner' : 'farmer',
      });
      if (!state?.enabled && isAdmin) {
        await writeFreenetHostFarmDoc(farmId, {
          enabled: true,
          mistFarmId: parsed.farmId,
          current: state,
          changedBy: uid,
        });
      }
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn the Freenet mirror on');
    } finally {
      setBusy(false);
    }
  };

  if (step === 'pin' && parsed) {
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
              This device already holds a Freenet key
              {existingSeedName ? ` for ${existingSeedName}` : ''}. A device keeps one; continuing
              replaces it. That farm stays recoverable with its own paper FarmCode.
            </span>
          </label>
        )}
        {error ? (
          <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
            {error}
          </div>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || !pinOk || (replacing && !confirmedReplace)}
            onClick={() => void finish()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-semibold disabled:opacity-50"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Use this FarmCode here
          </button>
          <button type="button" onClick={onCancel} className="px-3 py-1.5 text-[11px] text-slate-600">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void parseTyped(e)} className="space-y-2 rounded-xl border border-slate-200 p-3">
      <FarmCodeField id="hybridFarmCode" value={codeInput} onChange={setCodeInput} disabled={busy} />
      <p className="text-[10px] text-slate-500">{RISK_COPY}</p>
      {error ? (
        <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
          {error}
        </div>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || typed < FARM_CODE_BODY_LEN}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-semibold disabled:opacity-50"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Continue
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-[11px] text-slate-600">
          Cancel
        </button>
      </div>
    </form>
  );
}
