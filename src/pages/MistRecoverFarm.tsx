import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Loader2, ShieldAlert } from 'lucide-react';
import { FarmCodeError, parseFarmCode, type ParsedFarmCode } from '../../units/mist-freenet/src/index.ts';
import { APP_NAME } from '../brand';
import { finishMistFarmSetup } from '../mist/finishMistFarmSetup.ts';

const DEFAULT_FARM_NAME = 'Recovered farm';

type Step = 'form' | 'device-pin';

export function MistRecoverFarm() {
  const [step, setStep] = useState<Step>('form');
  const [farmCodeInput, setFarmCodeInput] = useState('');
  const [farmName, setFarmName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [parsed, setParsed] = useState<ParsedFarmCode | null>(null);
  const [devicePin, setDevicePin] = useState('');
  const [skipPin, setSkipPin] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateAndContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await parseFarmCode(farmCodeInput);
      setParsed(result);
      setStep('device-pin');
    } catch (err) {
      if (err instanceof FarmCodeError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Could not parse FarmCode');
      }
    } finally {
      setBusy(false);
    }
  };

  const finishSetup = async () => {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    try {
      await finishMistFarmSetup({
        farmId: parsed.farmId,
        farmName: farmName.trim() || DEFAULT_FARM_NAME,
        displayName: displayName.trim(),
        farmSeed: parsed.farmSeed,
        skipPin,
        devicePin: skipPin ? undefined : devicePin,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save mist session');
      setBusy(false);
    }
  };

  if (step === 'device-pin' && parsed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4">
        <div className="max-w-md w-full space-y-6 bg-white p-8 rounded-2xl shadow-xl">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
            <p className="font-semibold text-emerald-950">Farm recovered</p>
            <p className="text-emerald-800 mt-1 font-mono text-xs break-all">farmId: {parsed.farmId}</p>
            <p className="text-emerald-700 text-xs mt-2">
              Same cryptographic identity as the device that minted this FarmCode. Bones you put here stay
              on this device until Freenet sync ships.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">Optional device PIN</h2>
            <p className="text-sm text-slate-600 mt-2">
              A 4-digit PIN locks <strong>this device only</strong>. It is separate from FarmCode.
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

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setStep('form');
              setError(null);
            }}
            className="w-full text-sm text-slate-500 hover:text-slate-800"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4">
      <div className="max-w-lg w-full space-y-6 bg-white p-8 rounded-2xl shadow-xl border border-violet-200">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">Experimental</p>
          <h2 className="text-2xl font-extrabold text-slate-900 mt-1">Recover mist farm</h2>
          <p className="text-sm text-slate-600 mt-2">
            Join an existing mist farm on this device using your paper <strong>FarmCode</strong>. {APP_NAME}{' '}
            production login (Firebase invite PINs) is unchanged.
          </p>
        </div>

        <div className="flex items-start gap-3 text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <p className="font-semibold">Recovery root — not day-to-day login</p>
            <p>
              FarmCode re-derives your farm&apos;s cryptographic identity on this laptop. It does not download
              another device&apos;s IndexedDB blobs yet — cross-device bone sync requires Freenet (not wired).
            </p>
          </div>
        </div>

        {error && (
          <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <form className="space-y-4" onSubmit={(e) => void validateAndContinue(e)}>
          <div className="space-y-2">
            <label htmlFor="farmCode" className="text-sm font-medium text-slate-700">
              FarmCode
            </label>
            <textarea
              id="farmCode"
              required
              rows={3}
              value={farmCodeInput}
              onChange={(e) => setFarmCodeInput(e.target.value)}
              placeholder="mist-fc-1  XXXXX-XXXXX-…"
              spellCheck={false}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-mono text-sm leading-relaxed"
            />
            <p className="text-[11px] text-slate-500">
              Paste the full line from your paper wallet (starts with <code>mist-fc-1</code>).
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="farmName" className="text-sm font-medium text-slate-700">
              Farm name <span className="text-slate-400 font-normal">(optional, display only)</span>
            </label>
            <input
              id="farmName"
              value={farmName}
              onChange={(e) => setFarmName(e.target.value)}
              placeholder={DEFAULT_FARM_NAME}
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
            disabled={busy || displayName.trim().length < 2 || !farmCodeInput.trim()}
            className="w-full flex justify-center items-center gap-2 py-3 rounded-xl bg-violet-700 text-white font-semibold disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <KeyRound className="w-5 h-5" />}
            Validate &amp; continue
          </button>
        </form>

        <div className="text-sm text-center space-y-2 pt-2 border-t border-slate-100">
          <Link to="/login/mist-new-farm" className="text-violet-700 hover:text-violet-900 font-medium">
            Mint a new mist farm instead
          </Link>
          <Link to="/login" className="block text-slate-500 hover:text-slate-800">
            Back to Firebase login
          </Link>
        </div>
      </div>
    </div>
  );
}
