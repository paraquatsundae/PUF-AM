/**
 * Settings → General — the way out of a restored farm on a phone.
 *
 * Sign out lives in the sidebar too, but on a packaged APK that control sits
 * under the hamburger and can sit under the system gesture bar. Settings is
 * the place a packaged-APK user will look. After this, `/login` is the Join box
 * (`src/lib/leaveFarmSession.ts`).
 */

import React, { useState } from 'react';
import { LogOut, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isFarmCodeSession } from '../lib/farmPipes';

export function SettingsLeaveFarmCard() {
  const { logout, userData } = useAuth();
  const farmCode = isFarmCodeSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = farmCode ? 'Leave this farm on this device' : 'Sign out';

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <h2 className="text-lg font-bold text-slate-900">Account</h2>
      <p className="text-sm text-slate-600 leading-relaxed">
        {farmCode ? (
          <>
            Leave{' '}
            {userData?.farmId ? (
              <strong>{userData.farmId}</strong>
            ) : (
              'this farm'
            )}{' '}
            so this device can join another. Records stay here — this is not a wipe.
            Opening this farm again needs the paper FarmCode.
          </>
        ) : (
          <>
            Sign out of this farm on this device and return to <strong>Join a farm</strong>.
            Records stay on the device. Use a new invite PIN (or the owner recovery PIN)
            to come back.
          </>
        )}
      </p>
      {error && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
          {error}
        </div>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          void logout().catch((err: unknown) => {
            setBusy(false);
            setError(err instanceof Error ? err.message : 'Could not sign out. Try again.');
          });
        }}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
        {label}
      </button>
    </div>
  );
}
