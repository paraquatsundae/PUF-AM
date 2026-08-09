/**
 * Mist device PIN gate — the *only* thing a returning device should ever be
 * asked for.
 *
 * The farm is already here: sealed in `localStorage`, with its diary and blocks
 * in IndexedDB. Opening it again is a decrypt, not a sign-in, so there is no
 * FarmCode to type and no join ticket to fetch. Those two belong to a device
 * that does not have the farm yet — and the way out of a forgotten PIN is
 * exactly that, which is why the FarmCode is a link at the bottom rather than a
 * field at the top.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Loader2, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getMistSessionMeta } from '../mist/mistDeviceSession.ts';
import { APP_NAME } from '../brand';

export function MistUnlockGate({ children }: { children: React.ReactNode }) {
  const { mistLocked, unlockMistSession, logout } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!mistLocked) return <>{children}</>;

  const meta = getMistSessionMeta();
  const name = meta?.displayName || 'there';
  const farmName = meta?.farmName;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-violet-200 p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center">
            <Lock className="w-7 h-7 text-violet-700" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">Unlock this farm</h1>
          <p className="text-sm text-slate-600">
            Welcome back, <strong>{name.split(' ')[0] || name}</strong>
            {farmName ? (
              <>
                {' '}
                · <strong>{farmName}</strong>
              </>
            ) : null}
          </p>
          <p className="text-xs text-slate-500">
            Enter your <strong>4-digit device PIN</strong> for this laptop/tablet. This is{' '}
            <em>not</em> your FarmCode recovery key.
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
            void unlockMistSession(pin).then((ok) => {
              setBusy(false);
              if (!ok) {
                setError('Incorrect device PIN');
                setPin('');
                return;
              }
              setPin('');
            });
          }}
        >
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]*"
              maxLength={4}
              required
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Device PIN"
              className="w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 tracking-widest text-center text-lg"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={busy || pin.length !== 4}
            className="w-full py-3 rounded-xl bg-violet-700 text-white font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Unlock {APP_NAME}
          </button>
        </form>

        <div className="space-y-2 pt-2 border-t border-slate-100">
          <p className="text-[11px] text-slate-500 text-center">
            Forgotten it? The farm is encrypted with this PIN, so it cannot be reset from here —{' '}
            <Link
              to="/login/mist-recover"
              className="font-semibold text-violet-700 hover:underline"
            >
              recover the farm with your FarmCode
            </Link>{' '}
            instead.
          </p>
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full text-xs text-slate-400 hover:text-slate-700"
          >
            Sign out — clears this device&apos;s session and the farm held on it
          </button>
        </div>
      </div>
    </div>
  );
}
