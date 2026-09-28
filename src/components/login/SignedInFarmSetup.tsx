import { useState, type FormEvent } from 'react';
import { Check, Copy, Loader2, Sprout } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { createFarmForSignedInAccount, mintEnrollmentCode } from '../../lib/invitePinAuth';

/**
 * Shown after Google sign-in when this account has no farm. The logged-out
 * create form is unreachable once `user` is set (`useLoginFlow` leaves /login).
 */
export function SignedInFarmSetup({
  onCreated,
}: {
  onCreated: (created: { farmId: string; recoveryPin: string }) => void;
}) {
  const { user } = useAuth();
  const [farmName, setFarmName] = useState('');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [enrollmentCode, setEnrollmentCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [minting, setMinting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await createFarmForSignedInAccount({
        farmName,
        displayName,
        enrollmentCode,
      });
      onCreated({ farmId: created.farmId, recoveryPin: created.recoveryPin });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create farm.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-slate-50 py-12 px-4">
      <form onSubmit={(e) => void submit(e)} className="max-w-md w-full space-y-4 bg-white p-8 rounded-2xl shadow-xl">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 text-center">Create your farm</h2>
          <p className="mt-2 text-sm text-slate-600 text-center">
            Signed in as <strong>{user?.email || 'this Google account'}</strong>. This account
            becomes the farm admin.
          </p>
        </div>
        {error ? (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        ) : null}
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Farm name</span>
          <input
            required
            minLength={2}
            value={farmName}
            onChange={(e) => setFarmName(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Your name</span>
          <input
            required
            minLength={2}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-700">Enrollment code</span>
            <button
              type="button"
              disabled={busy || minting}
              onClick={() => {
                setMinting(true);
                setError(null);
                void mintEnrollmentCode()
                  .then((issued) => setEnrollmentCode(issued.code))
                  .catch((err: unknown) => {
                    setError(err instanceof Error ? err.message : 'Could not generate a code.');
                  })
                  .finally(() => setMinting(false));
              }}
              className="text-xs font-medium text-emerald-800 underline underline-offset-2 disabled:opacity-60"
            >
              {minting ? 'Generating…' : 'Generate a code'}
            </button>
          </span>
          <input
            required
            value={enrollmentCode}
            onChange={(e) => setEnrollmentCode(e.target.value.toUpperCase())}
            autoComplete="off"
            spellCheck={false}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <span className="block text-[11px] text-slate-400">
            One-use. Generate one with this admin account, or type a code you already issued.
            Write it down — it is not stored in a form you can look up later.
          </span>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl text-white bg-slate-900 hover:bg-slate-800 font-semibold disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sprout className="w-5 h-5" />}
          Create farm
        </button>
      </form>
    </div>
  );
}

export function SignedInFarmRecovery({
  farmId,
  recoveryPin,
  onContinue,
}: {
  farmId: string;
  recoveryPin: string;
  onContinue: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-slate-50 py-12 px-4">
      <div className="max-w-md w-full space-y-6 bg-white p-8 rounded-2xl shadow-xl">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 text-center">Farm created</h2>
          <p className="mt-2 text-sm text-slate-600 text-center">
            You are the farm admin on this Google account. Save the owner recovery PIN — it is
            shown once, for a wiped device.
          </p>
        </div>
        <p className="text-sm text-slate-600 text-center">
          Farm ID <code className="font-mono text-slate-900">{farmId}</code>
        </p>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-2">
          <code className="flex-1 font-mono text-2xl tracking-widest text-emerald-950">{recoveryPin}</code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(recoveryPin).then(() => {
                setCopied(true);
              });
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-700 text-white text-sm"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            Copy
          </button>
        </div>
        <button
          type="button"
          onClick={onContinue}
          className="w-full py-3 rounded-xl bg-slate-900 text-white font-semibold"
        >
          Open the farm
        </button>
      </div>
    </div>
  );
}
