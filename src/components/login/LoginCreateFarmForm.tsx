import { ChevronRight, Loader2, Network, Sprout } from 'lucide-react';
import type { LoginFlow } from '../../hooks/useLoginFlow';

export function LoginCreateFarmForm({ flow }: { flow: LoginFlow }) {
  const {
    isSigningIn,
    setLocalError,
    farmName,
    setFarmName,
    displayName,
    setDisplayName,
    showNearbyOnCreate,
    setShowNearbyOnCreate,
    enrollmentCode,
    setEnrollmentCode,
    byoActive,
    freenetOption,
    setStep,
    handleCreateFarm,
  } = flow;

  return (
    <form className="space-y-4" onSubmit={handleCreateFarm}>
      {freenetOption !== 'hidden' && !byoActive && (
        <button
          type="button"
          onClick={() => {
            setStep('freenet-explain');
            setLocalError(null);
          }}
          className="w-full text-left rounded-2xl border-2 border-violet-300 bg-violet-50/40 p-4 hover:border-violet-500 hover:bg-violet-50 transition-colors"
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-violet-700 text-white shrink-0">
              <Network className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-slate-900">Start without a cloud account</h3>
              <p className="text-sm text-slate-600 mt-1">
                Offline Freenet farm on this device. No enrollment code, no Firebase, no
                invite PIN from a server owner.
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-violet-700 shrink-0 mt-1" />
          </div>
        </button>
      )}

      <div className="space-y-2">
        <label htmlFor="farmName" className="text-sm font-medium text-slate-700">
          Farm name
        </label>
        <input
          id="farmName"
          type="text"
          required
          minLength={2}
          value={farmName}
          onChange={(e) => setFarmName(e.target.value)}
          placeholder="Farm name"
          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="ownerName" className="text-sm font-medium text-slate-700">
          Your name
        </label>
        <input
          id="ownerName"
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

      {!byoActive ? (
        <>
          <div className="space-y-2">
            <label htmlFor="enrollmentCode" className="text-sm font-medium text-slate-700">
              Enrollment code
            </label>
            <input
              id="enrollmentCode"
              type="text"
              required
              value={enrollmentCode}
              onChange={(e) => setEnrollmentCode(e.target.value.toUpperCase())}
              placeholder="From whoever runs this server"
              autoComplete="off"
              spellCheck={false}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[11px] text-slate-400">
              Only for a <strong>cloud</strong> farm on this Firebase project. Each code works
              once. To start on your own, use Freenet above — that path does not use a code.
            </p>
          </div>

          <label className="flex items-start gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showNearbyOnCreate}
              onChange={(e) => setShowNearbyOnCreate(e.target.checked)}
              className="mt-1 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>
              Show this farm to nearby joiners (uses this device’s location). Workers tap the name
              instead of typing it.
            </span>
          </label>
        </>
      ) : (
        <p className="text-[11px] text-slate-500">
          No enrollment code. After create, share the farm ID and an invite PIN — other
          devices must paste the same Firebase config first.
        </p>
      )}

      <button
        type="submit"
        disabled={isSigningIn}
        className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl text-white bg-slate-900 hover:bg-slate-800 font-semibold disabled:opacity-60"
      >
        {isSigningIn ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sprout className="w-5 h-5" />}
        Create farm
      </button>
      <p className="text-[11px] text-slate-400 text-center">
        You become the farm admin. Write down the owner recovery PIN shown next — that is
        what you type under Join later if this device is wiped. Then mint staff invite PINs
        in Farm Management.
      </p>
    </form>
  );
}
