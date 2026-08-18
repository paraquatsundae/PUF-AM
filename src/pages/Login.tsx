import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  canShowWelcomeBack,
  clearRememberedLoginHints,
  getLastDisplayName,
  getLastFarm,
} from '../lib/deviceSession';
import { getDeviceCoords } from '../lib/deviceLocation';
import { fetchNearbyFarms, type NearbyFarm } from '../lib/invitePinAuth';
import {
  Loader2,
  KeyRound,
  Sprout,
  Copy,
  Check,
  MapPin,
  Navigation,
  ArrowLeft,
  ChevronRight,
  Network,
} from 'lucide-react';
import { APP_NAME } from '../brand';
import { getFarmStoreBackend, isMistExperimentalEnabled } from '../mist/farmStoreBackend.ts';
import { isDesktopShell } from '../lib/desktopBridge.ts';
import { freenetOptionState, initialLoginStep, type LoginStep } from '../lib/loginStorageChoice.ts';
import { LoginBrand } from '../components/login/LoginBrand';
import { WelcomeChooser } from '../components/login/WelcomeChooser';
import { CloudSyncOptions } from '../components/login/CloudSyncOptions';
import { ByoFirebaseExplain } from '../components/login/ByoFirebaseExplain';
import { ByoFirebaseSetup } from '../components/login/ByoFirebaseSetup';
import { ByoFirebaseConfigPaste } from '../components/login/ByoFirebaseConfigPaste';
import { ByoFirebaseRules } from '../components/login/ByoFirebaseRules';
import { PufworksSubscribeExplain } from '../components/login/PufworksSubscribeExplain';
import { FreenetExplain } from '../components/login/FreenetExplain';
import {
  byoProjectId,
  clearByoFirebaseAndReload,
  isByoFirebase,
  type ByoFirebaseWebConfig,
} from '../lib/byoFirebaseConfig';

type Mode = 'join' | 'create';

export function Login() {
  const {
    user,
    userData,
    signInWithInvitePin,
    signInWithGoogle,
    createFarm,
    completeFarmSignIn,
    error: authError,
    loading,
    mistLocked,
  } = useAuth();
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
  const [enrollmentCode, setEnrollmentCode] = useState('');
  const [byoDraftConfig, setByoDraftConfig] = useState<ByoFirebaseWebConfig | null>(null);
  const [byoFarmId, setByoFarmId] = useState(() => getLastFarm()?.farmId || '');
  const byoActive = isByoFirebase();
  const byoProject = byoProjectId();
  const freenetOption = freenetOptionState({
    mistEnabled: isMistExperimentalEnabled(),
    desktop: isDesktopShell(),
    workshopHub: import.meta.env.DEV,
  });
  // The tablet can hold a mist farm, and beside a Freenet node app it can fetch
  // one; what it still cannot do is *send* one, because publishing needs a tool
  // that only runs on a laptop. Say so on the card that offers the choice —
  // see `Plans/APK_FREENET_PLUGIN.md` §3a.
  const [step, setStep] = useState<LoginStep>(() =>
    initialLoginStep({
      freenet: freenetOptionState({
        mistEnabled: isMistExperimentalEnabled(),
        desktop: isDesktopShell(),
        workshopHub: import.meta.env.DEV,
      }),
      welcomeBack: canShowWelcomeBack(),
      backend: getFarmStoreBackend(),
      byoConfigured: isByoFirebase(),
    })
  );
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

  // Only ask for GPS once the operator has actually chosen the cloud path — the
  // storage chooser should never trigger a location prompt.
  useEffect(() => {
    if (step === 'firebase' && mode === 'join' && !welcomeBack && !isByoFirebase()) {
      void loadNearby();
    }
  }, [step, mode, loadNearby, welcomeBack]);

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

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setLocalError(null);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setLocalError(
          err instanceof Error ? err.message : 'Google sign-in failed. Try again, or use an invite PIN.',
        );
      }
      setIsSigningIn(false);
    }
  };

  const handlePinSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSigningIn(true);
    setLocalError(null);
    try {
      if (byoActive && !byoFarmId.trim() && !selectedFarm?.farmId && !lastFarm?.farmId) {
        setLocalError('Enter the farm ID from whoever set up this Firebase project.');
        setIsSigningIn(false);
        return;
      }
      const farmId = byoActive
        ? byoFarmId.trim() || selectedFarm?.farmId || lastFarm?.farmId
        : selectedFarm?.farmId || lastFarm?.farmId;
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
      let opts: { lat?: number; lng?: number; showNearby?: boolean; enrollmentCode?: string } = {
        showNearby: showNearbyOnCreate,
        enrollmentCode: enrollmentCode.trim(),
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
          {pendingFarm?.farmId ? (
            <p className="text-sm text-slate-600 text-center">
              Farm ID{' '}
              <code className="font-mono text-slate-900">{pendingFarm.farmId}</code>
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

  if (step === 'choose') {
    return (
      <WelcomeChooser
        freenetOption={freenetOption}
        onCloud={() => {
          setStep('cloud-options');
          setLocalError(null);
        }}
        onFreenet={() => {
          setStep('freenet-explain');
          setLocalError(null);
        }}
      />
    );
  }

  if (step === 'cloud-options') {
    return (
      <CloudSyncOptions
        canGoWelcome={freenetOption !== 'hidden'}
        onPufworks={() => {
          setStep('firebase');
          setLocalError(null);
        }}
        onByo={() => {
          setStep('cloud-byo');
          setLocalError(null);
        }}
        onSubscribe={() => {
          setStep('cloud-subscribe');
          setLocalError(null);
        }}
        onBack={() => {
          setStep('choose');
          setLocalError(null);
        }}
      />
    );
  }

  if (step === 'cloud-byo') {
    return (
      <ByoFirebaseExplain
        onBack={() => setStep('cloud-options')}
        onFreenet={() => setStep('freenet-explain')}
        onContinue={() => setStep('cloud-byo-setup')}
      />
    );
  }

  if (step === 'cloud-byo-setup') {
    return (
      <ByoFirebaseSetup
        onBack={() => setStep('cloud-byo')}
        onFreenet={() => setStep('freenet-explain')}
        onContinue={() => setStep('cloud-byo-config')}
      />
    );
  }

  if (step === 'cloud-byo-config') {
    return (
      <ByoFirebaseConfigPaste
        onBack={() => setStep('cloud-byo-setup')}
        onValid={(config) => {
          setByoDraftConfig(config);
          setStep('cloud-byo-rules');
        }}
      />
    );
  }

  if (step === 'cloud-byo-rules' && byoDraftConfig) {
    return (
      <ByoFirebaseRules config={byoDraftConfig} onBack={() => setStep('cloud-byo-config')} />
    );
  }

  if (step === 'cloud-subscribe') {
    return (
      <PufworksSubscribeExplain
        onBack={() => setStep('cloud-options')}
        onFreenet={() => setStep('freenet-explain')}
        onPufworks={() => setStep('firebase')}
      />
    );
  }

  if (step === 'freenet-explain') {
    return (
      <FreenetExplain
        freenetOption={freenetOption}
        onStart={() => navigate('/login/mist-new-farm')}
        onJoin={() => navigate('/login/mist-recover')}
        onBack={() => setStep('choose')}
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-xl">
        <LoginBrand
          title={
            welcomeBack
              ? `Welcome back, ${displayName.split(' ')[0] || displayName}`
              : byoActive
                ? 'Your Firebase'
                : 'PUFworks cloud'
          }
          subtitle={
            welcomeBack
              ? 'Type the owner recovery PIN from when this farm was created — same name as before. A staff invite PIN works the same way.'
              : byoActive
                ? 'Create a farm on your project, or sign in with the farm ID and your recovery or invite PIN.'
                : 'Owners sign back in with the recovery PIN shown at create. Staff use an invite PIN. A new farm needs an enrollment code.'
          }
        />

        {byoActive && byoProject ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 space-y-1">
            <p>
              This device is using <span className="font-mono text-slate-900">{byoProject}</span>.
              Google bills that project.
            </p>
            <button
              type="button"
              onClick={() => clearByoFirebaseAndReload()}
              className="font-medium text-slate-700 underline underline-offset-2"
            >
              Disconnect and pick another option
            </button>
          </div>
        ) : null}

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
                  Signed in before as <strong>{displayName}</strong>. Use that exact name with
                  the owner recovery PIN (or your invite PIN).
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
              {byoActive ? (
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
                    Nearby discovery is not shared across Firebase projects. The owner reads this
                    ID out with the PIN.
                  </p>
                </div>
              ) : null}
              {!byoActive ? (
                <>
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
                  Signing into <strong>{selectedFarm.name}</strong> — owner recovery PIN, or the
                  invite PIN from your manager.
                </p>
              )}
                </>
              ) : null}
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
              <p className="text-[11px] text-slate-400">
                This is the box for the <strong>owner recovery PIN</strong> you wrote down when
                the farm was created, or a staff invite PIN. Same name as before. Nearby farm
                is optional — it only helps catch a PIN for the wrong farm.
              </p>
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
                  Only for a Google account on this Firebase project. It does not replace the
                  owner recovery PIN — that goes in Farm PIN above.
                </p>
              </div>
            )}
          </form>
        ) : (
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
        )}

        <button
          type="button"
          onClick={() => {
            setStep('cloud-options');
            setLocalError(null);
          }}
          className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 pt-2 border-t border-slate-100"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Other cloud options
        </button>
      </div>
    </div>
  );
}
