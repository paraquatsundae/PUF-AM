/**
 * Settings → General → how this device reopens a Freenet farm.
 *
 * A Freenet farm is held on the device, not in an account, so "signing in
 * again" is really "unsealing the copy that is already here". The card says
 * which of the two ways that happens — straight in, or behind a 4-digit device
 * PIN — and lets the operator change it.
 *
 * It exists because the choice was only ever offered once, on the first-run
 * screen, with the box pre-ticked to skip. An operator who wanted a PIN
 * afterwards had no way to add one, and one who set a PIN on a laptop that now
 * lives in a locked office had no way to drop it.
 *
 * The FarmCode is not an alternative to any of this: it is the paper recovery
 * key for a *new* device, and the copy here has to keep saying so, because the
 * habit this app is trying to break is typing it at every launch.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §4
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Loader2, Lock, ShieldCheck, Unlock } from 'lucide-react';

import { isFreenetFarm } from '../lib/farmPipes.ts';
import {
  changeMistDevicePin,
  getMistSessionMeta,
  mistUnlockMode,
} from '../mist/mistDeviceSession.ts';

type Mode = 'idle' | 'set' | 'change' | 'remove';

const PIN_LENGTH = 4;

function digits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, PIN_LENGTH);
}

export function MistDeviceCard() {
  const [unlock, setUnlock] = useState(mistUnlockMode);
  const [mode, setMode] = useState<Mode>('idle');
  const [currentPin, setCurrentPin] = useState('');
  const [nextPin, setNextPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // A cloud farm has none of this: its session is a Firebase one, and
  // `UnlockPinSettingsCard` is the card that applies there.
  if (!isFreenetFarm() || unlock === 'absent') return null;

  const meta = getMistSessionMeta();
  const hasPin = unlock === 'pin';

  const reset = () => {
    setMode('idle');
    setCurrentPin('');
    setNextPin('');
    setConfirmPin('');
    setError(null);
  };

  const apply = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const removing = mode === 'remove';
      if (!removing && nextPin.length !== PIN_LENGTH) {
        setError(`A device PIN is ${PIN_LENGTH} digits.`);
        return;
      }
      if (!removing && nextPin !== confirmPin) {
        setError('The two PINs do not match.');
        return;
      }

      const ok = await changeMistDevicePin({
        ...(hasPin ? { currentPin } : {}),
        ...(removing ? {} : { nextPin }),
      });
      if (!ok) {
        setError(
          hasPin
            ? 'That is not the device PIN this farm is locked with.'
            : 'This device could not unseal its own farm. Sign out and recover with the FarmCode.',
        );
        return;
      }

      setUnlock(mistUnlockMode());
      setMessage(
        removing
          ? 'PIN removed. This device now opens straight into the farm.'
          : 'Device PIN saved. It is asked for the next time this app opens.',
      );
      reset();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-violet-50">
          <ShieldCheck className="w-5 h-5 text-violet-700" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-900">This device</h2>
          <p className="text-sm text-slate-600 mt-1">
            {meta?.farmName ? <strong>{meta.farmName}</strong> : 'This farm'} is stored on this
            computer and stays here between launches. You do not need the FarmCode or a join ticket
            to open it again — those are for putting the farm on a <em>new</em> device.
          </p>
        </div>
      </div>

      <div
        className={`flex items-start gap-2.5 text-sm rounded-xl border px-3 py-2.5 ${
          hasPin
            ? 'text-emerald-900 bg-emerald-50 border-emerald-200'
            : 'text-amber-900 bg-amber-50 border-amber-200'
        }`}
      >
        {hasPin ? (
          <Lock className="w-4 h-4 shrink-0 mt-0.5" />
        ) : (
          <Unlock className="w-4 h-4 shrink-0 mt-0.5" />
        )}
        <span>
          {hasPin ? (
            <>
              <strong>Next time you open PUF-AM it asks for your device PIN.</strong> The farm is
              encrypted with it, so nobody who copies this computer&apos;s files can read the farm
              without it.
            </>
          ) : (
            <>
              <strong>Next time you open PUF-AM it goes straight into the farm.</strong> Convenient,
              and worth knowing: anyone who can log into this computer can open the farm. Set a
              device PIN if this laptop leaves the office or rides in a ute.
            </>
          )}
        </span>
      </div>

      {message && (
        <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
          {message}
        </div>
      )}
      {error && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      {mode === 'idle' ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setMode(hasPin ? 'change' : 'set');
              setMessage(null);
              setError(null);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-700 text-white text-sm font-semibold"
          >
            <KeyRound className="w-4 h-4" />
            {hasPin ? 'Change device PIN' : 'Set a device PIN'}
          </button>
          {hasPin && (
            <button
              type="button"
              onClick={() => {
                setMode('remove');
                setMessage(null);
                setError(null);
              }}
              className="px-4 py-2.5 rounded-xl text-rose-700 bg-rose-50 text-sm font-semibold"
            >
              Remove PIN
            </button>
          )}
        </div>
      ) : (
        <form
          className="space-y-3 border-t border-slate-100 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void apply();
          }}
        >
          {hasPin && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">Current device PIN</span>
              <input
                value={currentPin}
                onChange={(e) => setCurrentPin(digits(e.target.value))}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                placeholder="••••"
                className="max-w-[10rem] px-3 py-2.5 border border-slate-200 rounded-xl font-mono text-center tracking-[0.3em]"
              />
            </label>
          )}

          {mode !== 'remove' && (
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-700">New PIN</span>
                <input
                  value={nextPin}
                  onChange={(e) => setNextPin(digits(e.target.value))}
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  autoFocus={!hasPin}
                  placeholder="••••"
                  className="max-w-[10rem] px-3 py-2.5 border border-slate-200 rounded-xl font-mono text-center tracking-[0.3em]"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-700">Repeat it</span>
                <input
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(digits(e.target.value))}
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="••••"
                  className="max-w-[10rem] px-3 py-2.5 border border-slate-200 rounded-xl font-mono text-center tracking-[0.3em]"
                />
              </label>
            </div>
          )}

          <p className="text-xs text-slate-500">
            {mode === 'remove'
              ? 'The farm stays on this device and is re-sealed with a key kept beside it, so it opens without being asked for anything.'
              : 'There is no way to recover a forgotten device PIN — the farm is encrypted with it. If it goes, the paper FarmCode is what brings the farm back onto a device.'}
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'remove' ? 'Remove the PIN' : 'Save device PIN'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={reset}
              className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-800 text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <p className="text-xs text-slate-500 border-t border-slate-100 pt-3">
        Putting this farm on another laptop or tablet is a different job: they need the{' '}
        <strong>FarmCode</strong> and a <strong>join ticket</strong> —{' '}
        <Link to="/farm-setup" className="font-semibold text-violet-700 hover:underline">
          Farm setup → People
        </Link>{' '}
        shows who has been given one.
      </p>
    </div>
  );
}
