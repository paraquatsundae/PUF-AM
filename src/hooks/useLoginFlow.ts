import { useCallback, useEffect, useState, type FormEvent } from 'react';
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
import { getFarmStoreBackend, isMistExperimentalEnabled } from '../mist/farmStoreBackend.ts';
import { isDesktopShell } from '../lib/desktopBridge.ts';
import { freenetOptionState, initialLoginStep, type LoginStep } from '../lib/loginStorageChoice.ts';
import {
  byoProjectId,
  isByoFirebase,
  type ByoFirebaseWebConfig,
} from '../lib/byoFirebaseConfig';

type Mode = 'join' | 'create';

export function useLoginFlow() {
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
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('join');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [farmName, setFarmName] = useState('');
  const [displayName, setDisplayName] = useState(() => getLastDisplayName());
  const [recoveryPin, setRecoveryPin] = useState<string | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [pendingFarm, setPendingFarm] = useState<{ farmId: string; farmName: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [nearby, setNearby] = useState<NearbyFarm[]>([]);
  const [selectedFarm, setSelectedFarm] = useState<NearbyFarm | null>(() => {
    const last = getLastFarm();
    return last
      ? { farmId: last.farmId, name: last.farmName, lat: 0, lng: 0, distanceKm: 0, showNearby: true }
      : null;
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
    if (step === 'firebase' && mode === 'join' && !welcomeBack && !isByoFirebase()) {
      void loadNearby();
    }
  }, [step, mode, loadNearby, welcomeBack]);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setLocalError(null);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setLocalError(
          err instanceof Error ? err.message : 'Google sign-in failed. Try again, or use an invite PIN.'
        );
      }
      setIsSigningIn(false);
    }
  };

  const handlePinSignIn = async (e: FormEvent) => {
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

  const handleCreateFarm = async (e: FormEvent) => {
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

  const forgetWelcome = () => {
    clearRememberedLoginHints();
    setWelcomeBack(false);
    setSelectedFarm(null);
    setPin('');
    setLocalError(null);
    void loadNearby();
  };

  return {
    loading,
    navigate,
    mode,
    setMode,
    isSigningIn,
    setLocalError,
    pin,
    setPin,
    farmName,
    setFarmName,
    displayName,
    setDisplayName,
    recoveryPin,
    pendingFarm,
    copied,
    nearby,
    selectedFarm,
    setSelectedFarm,
    welcomeBack,
    locating,
    locationNote,
    showNearbyOnCreate,
    setShowNearbyOnCreate,
    enrollmentCode,
    setEnrollmentCode,
    byoDraftConfig,
    setByoDraftConfig,
    byoFarmId,
    setByoFarmId,
    byoActive,
    byoProject,
    freenetOption,
    step,
    setStep,
    error,
    lastFarm,
    loadNearby,
    handleGoogleSignIn,
    handlePinSignIn,
    handleCreateFarm,
    continueAfterRecovery,
    copyRecovery,
    forgetWelcome,
  };
}

export type LoginFlow = ReturnType<typeof useLoginFlow>;
