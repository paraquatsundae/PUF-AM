/**
 * Soft lock: Firebase session is already restored; require personal unlock PIN
 * once per browser/tab session (and after Lock).
 */
import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getLastFarm } from '../lib/deviceSession';
import {
  dismissSetupPrompt,
  hasUnlockPin,
  isSetupPromptDismissed,
  markSessionUnlocked,
  needsUnlockGate,
  setUnlockPin,
  verifyUnlockPin,
} from '../lib/unlockPin';
import { APP_NAME } from '../brand';
import { Link } from 'react-router-dom';

export function AppUnlockGate({ children }: { children: React.ReactNode }) {
  const { user, userData, logout } = useAuth();
  const uid = user?.uid || '';
  const [locked, setLocked] = useState(() => needsUnlockGate(uid));
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSetupPrompt, setShowSetupPrompt] = useState(false);

  // Re-check when uid appears (auth restore).
  useEffect(() => {
    if (!uid) {
      setLocked(false);
      setShowSetupPrompt(false);
      return;
    }
    setLocked(needsUnlockGate(uid));
    if (!hasUnlockPin(uid) && !isSetupPromptDismissed(uid)) {
      setShowSetupPrompt(true);
    }
  }, [uid]);

  // Relock when tab was hidden a long time (cab privacy) — 15 min.
  useEffect(() => {
    if (!uid || !hasUnlockPin(uid)) return;
    let hiddenAt: number | null = null;
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt && Date.now() - hiddenAt > 15 * 60 * 1000) {
        setLocked(true);
        setPin('');
      }
      hiddenAt = null;
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [uid]);

  if (!uid) return <>{children}</>;

  if (locked && hasUnlockPin(uid)) {
    const farm = getLastFarm();
    const name = userData?.displayName || user?.displayName || 'there';
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
              <Lock className="w-7 h-7 text-emerald-700" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900">Unlock {APP_NAME}</h1>
            <p className="text-sm text-slate-600">
              Welcome back, <strong>{name.split(' ')[0] || name}</strong>
              {farm ? (
                <>
                  {' '}
                  · <strong>{farm.farmName}</strong>
                </>
              ) : null}
            </p>
            <p className="text-xs text-slate-500">
              Enter your personal unlock PIN for this device. This is not the farm invite code.
            </p>
          </div>

          {error && (
            <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
              {error}
            </div>
          )}

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              void verifyUnlockPin(uid, pin).then((ok) => {
                setBusy(false);
                if (!ok) {
                  setError('Incorrect unlock PIN');
                  return;
                }
                markSessionUnlocked(uid);
                setLocked(false);
                setPin('');
              });
            }}
          >
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                pattern="[0-9]*"
                maxLength={8}
                required
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="Unlock PIN"
                className="w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 tracking-widest text-center text-lg"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={busy || pin.length < 4}
              className="w-full py-3 rounded-xl bg-emerald-700 text-white font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Unlock
            </button>
          </form>

          <button
            type="button"
            onClick={() => void logout()}
            className="w-full text-xs text-slate-500 hover:text-slate-800"
          >
            Sign out — next time you&apos;ll need the farm invite PIN on this device
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      {showSetupPrompt && !hasUnlockPin(uid) && (
        <div className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Set a personal unlock PIN?</h2>
            <p className="text-sm text-slate-600">
              Optional 4–8 digit PIN for this phone/tablet/laptop. It keeps the cab private when you
              step away — it does <strong>not</strong> replace the farm invite code.
            </p>
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              Each <strong>new device</strong> still needs the farm invite PIN (one-time per device)
              with your name. Unlock PIN is local to this device only.
            </p>
            <UnlockPinForm
              uid={uid}
              onDone={() => {
                setShowSetupPrompt(false);
                dismissSetupPrompt(uid);
              }}
              onSkip={() => {
                dismissSetupPrompt(uid);
                setShowSetupPrompt(false);
              }}
            />
            <p className="text-[11px] text-slate-400 text-center">
              You can change this later in{' '}
              <Link to="/settings" className="underline" onClick={() => setShowSetupPrompt(false)}>
                Settings
              </Link>
              .
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function UnlockPinForm({
  uid,
  onDone,
  onSkip,
}: {
  uid: string;
  onDone: () => void;
  onSkip?: () => void;
}) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (a !== b) {
          setError('PINs do not match');
          return;
        }
        setBusy(true);
        void setUnlockPin(uid, a)
          .then(() => {
            setBusy(false);
            onDone();
          })
          .catch((err) => {
            setBusy(false);
            setError(err instanceof Error ? err.message : 'Could not save PIN');
          });
      }}
    >
      {error && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      <input
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={8}
        required
        value={a}
        onChange={(e) => setA(e.target.value.replace(/\D/g, ''))}
        placeholder="New unlock PIN (4–8 digits)"
        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
      />
      <input
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={8}
        required
        value={b}
        onChange={(e) => setB(e.target.value.replace(/\D/g, ''))}
        placeholder="Confirm unlock PIN"
        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
      />
      <div className="flex gap-2">
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200"
          >
            Not now
          </button>
        )}
        <button
          type="submit"
          disabled={busy || a.length < 4}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Save unlock PIN
        </button>
      </div>
    </form>
  );
}

export { UnlockPinForm };
