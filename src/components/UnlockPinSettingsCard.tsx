import React, { useState } from 'react';
import { KeyRound, Lock, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { clearUnlockPin, hasUnlockPin, lockSession } from '../lib/unlockPin';
import { UnlockPinForm } from './AppUnlockGate';

export function UnlockPinSettingsCard() {
  const { user } = useAuth();
  const uid = user?.uid || '';
  const [enabled, setEnabled] = useState(() => hasUnlockPin(uid));
  const [mode, setMode] = useState<'idle' | 'set' | 'change'>('idle');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!uid) return null;

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-emerald-50">
          <KeyRound className="w-5 h-5 text-emerald-700" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-900">Personal unlock PIN</h2>
          <p className="text-sm text-slate-600 mt-1">
            Optional PIN for this device after you&apos;re already signed in. Locks the app when you
            step away — not the same as the farm invite code.
          </p>
          <p className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mt-3">
            <strong>New phone, tablet, or laptop:</strong> use the farm invite PIN (one-time on that
            device) with your name. Then you can set a personal unlock PIN on that device. Unlock
            PINs do not sync between devices.
          </p>
        </div>
      </div>

      {msg && (
        <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
          {msg}
        </div>
      )}

      {mode === 'idle' && (
        <div className="flex flex-wrap gap-2">
          {enabled ? (
            <>
              <button
                type="button"
                onClick={() => {
                  lockSession();
                  setMsg('Locked. Unlock PIN will be required next.');
                  window.location.reload();
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold"
              >
                <Lock className="w-4 h-4" />
                Lock now
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('change');
                  setMsg(null);
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-800 text-sm font-semibold"
              >
                Change PIN
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  clearUnlockPin(uid);
                  setEnabled(false);
                  setBusy(false);
                  setMsg('Unlock PIN removed on this device.');
                }}
                className="px-4 py-2.5 rounded-xl text-rose-700 bg-rose-50 text-sm font-semibold inline-flex items-center gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Remove
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMode('set');
                setMsg(null);
              }}
              className="px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold"
            >
              Set unlock PIN
            </button>
          )}
        </div>
      )}

      {(mode === 'set' || mode === 'change') && (
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <p className="text-sm font-medium text-slate-800">
            {mode === 'change' ? 'Choose a new unlock PIN' : 'Create unlock PIN'}
          </p>
          <UnlockPinForm
            uid={uid}
            onDone={() => {
              setEnabled(true);
              setMode('idle');
              setMsg('Unlock PIN saved on this device.');
            }}
            onSkip={() => setMode('idle')}
          />
        </div>
      )}
    </div>
  );
}
