import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  canShowWelcomeBack,
  clearRememberedLoginHints,
  getLastDisplayName,
  getLastFarm,
} from '../lib/deviceSession';
import { getDeviceCoords } from '../lib/deviceLocation';
import { fetchNearbyFarms, type NearbyFarm } from '../lib/invitePinAuth';
import { Loader2, KeyRound, Sprout, Copy, Check, MapPin, Navigation } from 'lucide-react';
import { APP_NAME, APP_TAGLINE } from '../brand';
import { isMistExperimentalEnabled } from '../mist/farmStoreBackend.ts';

type Mode = 'join' | 'create';

export function Login() {
  const { user, userData, signInWithInvitePin, createFarm, completeFarmSignIn, error: authError, loading, mistLocked } =
    useAuth();
  const [mode, setMode] = useState<Mode>('join');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [farmName, setFarmName] = useState('');
  const [displayName, setDisplayName] = useState(() => getLastDisplayName());
  const [recoveryPin, setRecoveryPin] = useState<string | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [pendingFarm, setPendingFarm] = useState<{ farmId: string; farmName: string } | null>(
    null
  );
  const [copied, setCopied] = useState(false);
  const [nearby, setNearby] = useState<NearbyFarm[]>([]);
  const [selectedFarm, setSelectedFarm] = useState<NearbyFarm | null>(() => {
    const last = getLastFarm();
    return last ? { farmId: last.farmId, name: last.farmName, lat: 0, lng: 0, distanceKm: 0, showNearby: true } : null;
  });
  const [welcomeBack, setWelcomeBack] = useState(() => canShowWelcomeBack());
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [showNearbyOnCreate, setShowNearbyOnCreate] = useState(true);
  const navigate = useNavigate();

  const error = localError || authError;
  const lastFarm = getLastFarm();

  useEffect(() => {
    if (!loading && (user || userData || mistLocked) && !authError && !recoveryPin && !pendingToken) {
      navigate('/', { replace: true });
    }
  }, [user, userData, mistLocked, authError, loading, navigate, recoveryPin, pendingToken]);

  const loadNearby = useCallback(async () => {
    setLocating(true);
    setLocalError(null);
    setLocationNote(null);
    try {
      const coords = await getDeviceCoords();
      const farms = await fetchNearbyFarms(coords.lat, coords.lng, 5);
      setNearby(farms);
      if (farms.length === 0) {
        setLocationNote('No farms listed nearby. Enter a PIN from your manager, or create a farm.');
      } else {
        setLocationNote(`Found ${farms.length} farm${farms.length === 1 ? '' : 's'} nearby.`);
      }
    } catch (err: unknown) {
      setNearby([]);
      setLocationNote(err instanceof Error ? err.message : 'Location unavailable.');
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'join' && !welcomeBack) {
      void loadNearby();
    }
  }, [mode, loadNearby, welcomeBack]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Loading {APP_NAME}...</p>
        </div>
      </div>
    );
  }

  const handlePinSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSigningIn(true);
    setLocalError(null);
    try {
      const farmId = selectedFarm?.farmId || lastFarm?.farmId;
      const farmLabel = selectedFarm?.name || lastFarm?.farmName;
      await signInWithInvitePin(pin, displayName, farmId, farmLabel);
    } catch (err: unknown) {
      console.error('Sign in error:', err);
      setLocalError(err instanceof Error ? err.message : 'Sign-in failed. Check your PIN and try again.');
      setIsSigningIn(false);
    }
  };

  const handleCreateFarm = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSigningIn(true);
    setLocalError(null);
    setRecoveryPin(null);
    setPendingToken(null);
    try {
      let opts: { lat?: number; lng?: number; showNearby?: boolean } = {
        showNearby: showNearbyOnCreate,
      };
      try {
        const coords = await getDeviceCoords(8000);
        opts = { ...opts, lat: coords.lat, lng: coords.lng };
      } catch {
        /* optional — farm still created without discovery */
      }
      const result = await createFarm(farmName, displayName, opts);
      setRecoveryPin(result.recoveryPin);
      setPendingToken(result.token);
      setPendingFarm({ farmId: result.farmId, farmName: result.farmName });
      setIsSigningIn(false);
    } catch (err: unknown) {
      console.error('Create farm error:', err);
      setLocalError(err instanceof Error ? err.message : 'Could not create farm.');
      setIsSigningIn(false);
    }
  };

  const continueAfterRecovery = async () => {
    if (!pendingToken) {
      navigate('/', { replace: true });
      return;
    }
    setIsSigningIn(true);
    setLocalError(null);
    try {
      await completeFarmSignIn(pendingToken, displayName, pendingFarm || undefined);
      setRecoveryPin(null);
      setPendingToken(null);
      setPendingFarm(null);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : 'Sign-in failed after farm create.');
      setIsSigningIn(false);
    }
  };

  const copyRecovery = async () => {
    if (!recoveryPin) return;
    await navigator.clipboard.writeText(recoveryPin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (recoveryPin) {
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-xl">
        <div>
          <div className="mx-auto h-20 w-20 rounded-2xl flex items-center justify-center overflow-hidden shadow-sm ring-1 ring-emerald-900/20">
            <img
              src="/logo.png"
              alt={APP_NAME}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">
            {welcomeBack ? `Welcome back, ${displayName.split(' ')[0] || displayName}` : `Welcome to ${APP_NAME}`}
          </h2>
          <p className="mt-1 text-center text-sm font-medium text-emerald-800">{APP_TAGLINE}</p>
          <p className="mt-2 text-center text-sm text-slate-600">
            {welcomeBack
              ? 'Session was cleared — enter your farm invite PIN once to restore this device. (New phones/tablets/laptops always need this invite PIN the first time.)'
              : 'Tap a nearby farm, then enter your invite PIN — no Google account needed. Each new device needs that invite PIN once; then you can set a personal unlock PIN in Settings.'}
          </p>
        </div>

        {!welcomeBack && (
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => {
              setMode('join');
              setLocalError(null);
            }}
            className={`py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              mode === 'join' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            Join a farm
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('create');
              setLocalError(null);
            }}
            className={`py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              mode === 'create' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            Create a farm
          </button>
        </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {mode === 'join' ? (
          <form className="space-y-4" onSubmit={handlePinSignIn}>
            {welcomeBack && lastFarm ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 space-y-1">
                <p className="text-sm font-semibold text-emerald-950">{lastFarm.farmName}</p>
                <p className="text-xs text-emerald-800">
                  Signed in before as <strong>{displayName}</strong>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    clearRememberedLoginHints();
                    setWelcomeBack(false);
                    setSelectedFarm(null);
                    setPin('');
                    setLocalError(null);
                    void loadNearby();
                  }}
                  className="text-xs font-medium text-emerald-800 underline underline-offset-2 pt-1"
                >
                  Not you? Join a different farm
                </button>
              </div>
            ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium text-slate-700">Nearby farms</label>
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
                <div className="flex items-center gap-2 text-sm text-slate-500 py-3">
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
              {locationNote && (
                <p className="text-[11px] text-slate-500">{locationNote}</p>
              )}
              {selectedFarm && (
                <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                  Joining <strong>{selectedFarm.name}</strong> — enter the PIN from your manager.
                </p>
              )}
            </div>
            )}

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
                Invite PIN
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
              <p className="text-[11px] text-slate-400">
                You can join with PIN only if location is off — selecting a nearby farm catches wrong-PIN mistakes.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSigningIn}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 font-semibold disabled:opacity-60"
            >
              {isSigningIn ? <Loader2 className="w-5 h-5 animate-spin" /> : <KeyRound className="w-5 h-5" />}
              Join farm
            </button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={handleCreateFarm}>
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

            <button
              type="submit"
              disabled={isSigningIn}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl text-white bg-slate-900 hover:bg-slate-800 font-semibold disabled:opacity-60"
            >
              {isSigningIn ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sprout className="w-5 h-5" />}
              Create farm
            </button>
            <p className="text-[11px] text-slate-400 text-center">
              You become the farm admin and can mint worker invite PINs under Farm Management.
            </p>
            {isMistExperimentalEnabled() && (
              <p className="text-[11px] text-center pt-2 border-t border-slate-100">
                <Link
                  to="/login/mist-new-farm"
                  className="font-semibold text-violet-700 hover:text-violet-900 underline underline-offset-2"
                >
                  Experimental: create offline mist farm
                </Link>
                <span className="text-slate-400 block mt-1">Separate from Firebase invite PINs</span>
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
