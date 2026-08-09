import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, Loader2, ShieldAlert, Sprout } from 'lucide-react';
import {
  FARM_CODE_BODY_LEN,
  FARM_CODE_VERSION,
  mintFarmCode,
  parseFarmCode,
} from '../../units/mist-freenet/src/index.ts';
import { APP_NAME } from '../brand';
import { finishMistFarmSetup } from '../mist/finishMistFarmSetup.ts';

type Step = 'form' | 'show-code' | 'device-pin';

export function MistNewFarm() {
  const [step, setStep] = useState<Step>('form');
  const [farmName, setFarmName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [farmCode, setFarmCode] = useState<string | null>(null);
  const [confirmedWritten, setConfirmedWritten] = useState(false);
  const [devicePin, setDevicePin] = useState('');
  const [skipPin, setSkipPin] = useState(true);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const code = await mintFarmCode();
      setFarmCode(code);
      setStep('show-code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mint FarmCode');
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

  const continueAfterCode = () => {
    if (!confirmedWritten) return;
    setStep('device-pin');
  };

  const finishSetup = async () => {
    if (!farmCode) return;
    setBusy(true);
    setError(null);
    try {
      const parsed = await parseFarmCode(farmCode);
      await finishMistFarmSetup({
        farmId: parsed.farmId,
        farmName: farmName.trim(),
        displayName: displayName.trim(),
        farmSeed: parsed.farmSeed,
        skipPin,
        devicePin: skipPin ? undefined : devicePin,
        role: 'owner',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save mist session');
      setBusy(false);
    }
  };

  if (step === 'show-code' && farmCode) {
    // Minted line is `<version>  <grouped body>`; show them apart so the body
    // reads big on a tablet and nobody transcribes the format name.
    const [farmCodeVersionLabel, farmCodeBody] = farmCode.split(/\s{2,}/);

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4">
        <div className="max-w-lg w-full space-y-6 bg-white p-8 rounded-2xl shadow-xl border border-amber-200">
          <div className="flex items-start gap-3 text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="font-semibold">Write this down — shown once</p>
              <p>
                <strong>FarmCode</strong> is your permanent farm recovery key (paper wallet). It is{' '}
                <em>not</em> your day-to-day login and does not change if you set a device PIN later.
              </p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1">
            <p className="font-mono text-[11px] text-slate-500">{farmCodeVersionLabel}</p>
            <code
              className="block font-mono text-lg sm:text-2xl font-semibold leading-relaxed tracking-[0.1em] text-slate-900 whitespace-pre-wrap break-words select-all"
              title={farmCode}
            >
              {farmCodeBody}
            </code>
          </div>

          <p className="text-xs text-slate-500">
            {FARM_CODE_BODY_LEN} letters and numbers, in groups of five. The{' '}
            <code className="font-mono">{FARM_CODE_VERSION}</code> label is the format name, not part
            of the secret — you will not have to type it back in.
          </p>

          <button
            type="button"
            onClick={() => void copyCode()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            Copy (discouraged — prefer paper)
          </button>

          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-1"
              checked={confirmedWritten}
              onChange={(e) => setConfirmedWritten(e.target.checked)}
            />
            <span>I have written this FarmCode down and stored it safely offline</span>
          </label>

          <button
            type="button"
            disabled={!confirmedWritten}
            onClick={continueAfterCode}
            className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (step === 'device-pin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4">
        <div className="max-w-md w-full space-y-6 bg-white p-8 rounded-2xl shadow-xl">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Optional device PIN</h2>
            <p className="text-sm text-slate-600 mt-2">
              A 4-digit PIN locks <strong>this device only</strong>. It is separate from FarmCode and
              does not affect mist recovery keys.
            </p>
          </div>

          {error && (
            <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={skipPin}
              onChange={(e) => setSkipPin(e.target.checked)}
              className="mt-1"
            />
            <span>Skip PIN — stay logged in on this device (workshop default)</span>
          </label>

          {!skipPin && (
            <div className="space-y-2">
              <label htmlFor="devicePin" className="text-sm font-medium text-slate-700">
                4-digit device PIN
              </label>
              <input
                id="devicePin"
                type="password"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                value={devicePin}
                onChange={(e) => setDevicePin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-mono tracking-widest"
              />
            </div>
          )}

          <button
            type="button"
            disabled={busy || (!skipPin && devicePin.length !== 4)}
            onClick={() => void finishSetup()}
            className="w-full py-3 rounded-xl bg-slate-900 text-white font-semibold disabled:opacity-50 inline-flex justify-center items-center gap-2"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            Enter farm setup
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4">
      <div className="max-w-md w-full space-y-6 bg-white p-8 rounded-2xl shadow-xl border border-violet-200">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">Experimental</p>
          <h2 className="text-2xl font-extrabold text-slate-900 mt-1">New mist farm</h2>
          <p className="text-sm text-slate-600 mt-2">
            Offline-capable fork path for {APP_NAME}. Does not use Firebase invite PINs. Production
            login remains unchanged.
          </p>
        </div>

        {error && (
          <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <form className="space-y-4" onSubmit={(e) => void handleStart(e)}>
          <div className="space-y-2">
            <label htmlFor="farmName" className="text-sm font-medium text-slate-700">
              Farm name
            </label>
            <input
              id="farmName"
              required
              minLength={2}
              value={farmName}
              onChange={(e) => setFarmName(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="displayName" className="text-sm font-medium text-slate-700">
              Your name
            </label>
            <input
              id="displayName"
              required
              minLength={2}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full flex justify-center items-center gap-2 py-3 rounded-xl bg-violet-700 text-white font-semibold disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sprout className="w-5 h-5" />}
            Continue
          </button>
        </form>

        <Link to="/login" className="block text-center text-sm text-slate-500 hover:text-slate-800">
          Back to storage choice
        </Link>
      </div>
    </div>
  );
}
