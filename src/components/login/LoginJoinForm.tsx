import { KeyRound, Loader2 } from 'lucide-react';
import type { LoginFlow } from '../../hooks/useLoginFlow';

export function LoginJoinForm({ flow }: { flow: LoginFlow }) {
  const {
    isSigningIn,
    pin,
    setPin,
    displayName,
    setDisplayName,
    welcomeBack,
    byoFarmId,
    setByoFarmId,
    byoActive,
    handleGoogleSignIn,
    handlePinSignIn,
    forgetWelcome,
    lastFarm,
  } = flow;

  return (
    <form className="space-y-4" onSubmit={handlePinSignIn}>
      {welcomeBack && lastFarm ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-emerald-950">{lastFarm.farmName}</p>
          <p className="text-xs text-emerald-800">
            Signed in before as <strong>{displayName}</strong>. Use that exact name with the owner
            recovery PIN (or your invite PIN).
          </p>
          <button
            type="button"
            onClick={forgetWelcome}
            className="text-xs font-medium text-emerald-800 underline underline-offset-2 pt-1"
          >
            Not you? Join a different farm
          </button>
        </div>
      ) : byoActive ? (
        <div className="space-y-2">
          <label htmlFor="byoFarmId" className="text-sm font-medium text-slate-700">
            Farm ID
          </label>
          <input
            id="byoFarmId"
            type="text"
            required
            value={byoFarmId}
            onChange={(e) => setByoFarmId(e.target.value.trim())}
            placeholder="farm_…"
            spellCheck={false}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <p className="text-[11px] text-slate-400">
            Nearby discovery is not shared across Firebase projects. The owner reads this ID out
            with the PIN.
          </p>
        </div>
      ) : null}

      {!welcomeBack && (
        <div className="space-y-2">
          <label htmlFor="displayName" className="text-sm font-medium text-slate-700">
            Your name
          </label>
          <input
            id="displayName"
            type="text"
            autoComplete="name"
            required
            minLength={2}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Name"
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="pin" className="text-sm font-medium text-slate-700">
          Farm PIN
        </label>
        <div className="relative">
          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            id="pin"
            type="text"
            autoComplete="one-time-code"
            required
            value={pin}
            onChange={(e) => setPin(e.target.value.toUpperCase())}
            placeholder="XXXXXXXX"
            spellCheck={false}
            className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isSigningIn}
        className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 font-semibold disabled:opacity-60"
      >
        {isSigningIn ? <Loader2 className="w-5 h-5 animate-spin" /> : <KeyRound className="w-5 h-5" />}
        Sign in to farm
      </button>
      {!byoActive && (
        <div className="pt-1 space-y-1.5 text-center">
          <button
            type="button"
            onClick={() => void handleGoogleSignIn()}
            disabled={isSigningIn}
            className="text-xs font-medium text-slate-500 hover:text-slate-800 underline underline-offset-2 disabled:opacity-60"
          >
            Sign into PUFworks Firebase
          </button>
          <p className="text-[11px] text-slate-400">
            Only for a Google account on this Firebase project. It does not replace the owner
            recovery PIN.
          </p>
        </div>
      )}
    </form>
  );
}
