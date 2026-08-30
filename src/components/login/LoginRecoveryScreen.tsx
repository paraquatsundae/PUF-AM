import { Check, Copy } from 'lucide-react';
import type { LoginFlow } from '../../hooks/useLoginFlow';

export function LoginRecoveryScreen({ flow }: { flow: LoginFlow }) {
  const { recoveryPin, pendingFarm, byoActive, copied, isSigningIn, copyRecovery, continueAfterRecovery } =
    flow;
  if (!recoveryPin) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4">
      <div className="max-w-md w-full space-y-6 bg-white p-8 rounded-2xl shadow-xl">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 text-center">Farm created</h2>
          <p className="mt-2 text-sm text-slate-600 text-center">
            Save this <strong>owner recovery PIN</strong>. You will need it if this device is wiped.
            It is shown once.
          </p>
        </div>
        {pendingFarm?.farmId ? (
          <p className="text-sm text-slate-600 text-center">
            Farm ID <code className="font-mono text-slate-900">{pendingFarm.farmId}</code>
            {byoActive ? ' — crew need this plus the PIN, on a device that pasted the same config.' : '.'}
          </p>
        ) : null}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-2">
          <code className="flex-1 font-mono text-2xl tracking-widest text-emerald-950">{recoveryPin}</code>
          <button
            type="button"
            onClick={() => void copyRecovery()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-700 text-white text-sm"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            Copy
          </button>
        </div>
        <button
          type="button"
          disabled={isSigningIn}
          onClick={() => void continueAfterRecovery()}
          className="w-full py-3 rounded-xl bg-slate-900 text-white font-semibold disabled:opacity-60"
        >
          {isSigningIn ? 'Signing in…' : 'Continue to farm'}
        </button>
      </div>
    </div>
  );
}
