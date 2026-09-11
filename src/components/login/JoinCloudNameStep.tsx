import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Navigation } from 'lucide-react';
import { pinCodeHint } from '../../../shared/auth/byoPin.ts';
import type { LoginFlow } from '../../hooks/useLoginFlow';
import { BackLink, LoginBrand, LoginPanel } from './LoginBrand';

export function JoinCloudNameStep({ flow }: { flow: LoginFlow }) {
  const {
    join,
    displayName,
    setDisplayName,
    pin,
    nearby,
    selectedFarm,
    setSelectedFarm,
    locating,
    locationNote,
    loadNearby,
    handlePinSignIn,
    isSigningIn,
    error,
  } = flow;
  const nameRef = useRef<HTMLInputElement>(null);
  const [showNearby, setShowNearby] = useState(false);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  return (
    <LoginPanel>
      <LoginBrand title="Your name" subtitle="Invite PIN — your name" />
      <p className="text-sm text-slate-600">
        Joining with an invite PIN. Type your name exactly as you will next time — the same name
        and PIN reopen your account.
      </p>

      {error ? (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      ) : null}

      <form className="space-y-4" onSubmit={handlePinSignIn}>
        <div className="space-y-2">
          <label htmlFor="join-display-name" className="text-sm font-medium text-slate-700">
            Your name
          </label>
          <input
            id="join-display-name"
            ref={nameRef}
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

        <div className="flex items-center justify-between gap-2 text-sm">
          <p className="font-mono tracking-widest text-slate-700">{pinCodeHint(pin)}</p>
          <button
            type="button"
            onClick={() => join.changeCode()}
            className="text-sm font-medium text-emerald-700 hover:text-emerald-900"
          >
            Change
          </button>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              setShowNearby(true);
              void loadNearby();
            }}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Check it&apos;s the right farm (nearby)
          </button>
          {showNearby ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700">Nearby farms</span>
                <button
                  type="button"
                  onClick={() => void loadNearby()}
                  disabled={locating}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
                >
                  {locating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Navigation className="w-3.5 h-3.5" />
                  )}
                  Refresh
                </button>
              </div>
              {locating && nearby.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Finding farms near you…
                </div>
              ) : nearby.length > 0 ? (
                <ul className="space-y-2 max-h-48 overflow-y-auto">
                  {nearby.map((farm) => {
                    const selected = selectedFarm?.farmId === farm.farmId;
                    return (
                      <li key={farm.farmId}>
                        <button
                          type="button"
                          onClick={() => setSelectedFarm(farm)}
                          className={`w-full text-left px-3 py-3 rounded-xl border transition-colors ${
                            selected
                              ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                              : 'border-slate-200 hover:border-emerald-300'
                          }`}
                        >
                          <p className="text-sm font-semibold text-slate-900">{farm.name}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {farm.distanceKm < 1
                              ? `${Math.round(farm.distanceKm * 1000)} m away`
                              : `${farm.distanceKm.toFixed(1)} km away`}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {locationNote ? <p className="text-[11px] text-slate-500">{locationNote}</p> : null}
            </div>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={isSigningIn || displayName.trim().length < 2}
          className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-60 inline-flex justify-center items-center gap-2"
        >
          {isSigningIn ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
          Join farm
        </button>
      </form>

      <BackLink label="Back to Join a farm" onClick={() => join.back()} />
    </LoginPanel>
  );
}
