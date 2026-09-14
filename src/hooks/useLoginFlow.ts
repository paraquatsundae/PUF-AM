import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  canShowWelcomeBack,
  clearRememberedLoginHints,
  getLastDisplayName,
  getLastFarm,
} from '../lib/deviceSession';
import { getFarmStoreBackend, isMistExperimentalEnabled } from '../mist/farmStoreBackend.ts';
import { isFreenetHostPluginAvailable } from '../lib/androidFreenetHost.ts';
import { getFreenetHostCapability } from '../lib/freenetHostCapability.ts';
import { isNativePlatform } from '../lib/freenetRuntime.ts';
import { freenetJoinAvailability } from '../lib/joinCodeFlow.ts';
import { freenetOptionState, initialLoginStep, type LoginStep } from '../lib/loginStorageChoice.ts';
import { useJoinCode } from './useJoinCode.ts';
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
  const [selectedFarm, setSelectedFarm] = useState<{ farmId: string; name: string } | null>(() => {
    const last = getLastFarm();
    return last ? { farmId: last.farmId, name: last.farmName } : null;
  });
  const [welcomeBack, setWelcomeBack] = useState(() => canShowWelcomeBack());
  const [enrollmentCode, setEnrollmentCode] = useState('');
  const [byoDraftConfig, setByoDraftConfig] = useState<ByoFirebaseWebConfig | null>(null);
  const [byoFarmId, setByoFarmId] = useState(() => getLastFarm()?.farmId || '');
  const byoActive = isByoFirebase();
  const byoProject = byoProjectId();
  // Host capability, not a build flag, decides whether Freenet is on the menu
  // (Plans/FREENET_NETWORK_PACK.md decision 5). The web bundle hides it.
  const freenetOption = freenetOptionState({
    capability: getFreenetHostCapability(),
    mistEnabled: isMistExperimentalEnabled(),
    workshopHub: import.meta.env.DEV,
    nativeReader: isNativePlatform(),
  });
  const joinAvailability = freenetJoinAvailability({
    capability: getFreenetHostCapability(),
    native: isNativePlatform(),
    workshopHub: import.meta.env.DEV,
    canStartOwnNode: isFreenetHostPluginAvailable(),
  });
  const join = useJoinCode({ availability: joinAvailability });
  const [step, setStep] = useState<LoginStep>(() =>
    initialLoginStep({
      freenet: freenetOption,
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
      let message = err instanceof Error ? err.message : 'Sign-in failed. Check your PIN and try again.';
      if (/invite pin not found/i.test(message)) {
        message +=
          ' If this was a Freenet join ticket, it starts with PUF-. If it is the owner recovery PIN, the same box works — check the name is the one used at create.';
      }
      setLocalError(message);
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
      const result = await createFarm(farmName, displayName, {
        enrollmentCode: enrollmentCode.trim(),
      });
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
    setStep('join');
  };

  const continueJoin = () => {
    if (join.classification.kind === 'invite-pin') {
      setPin(join.classification.normalized);
    }
    join.continue();
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
    selectedFarm,
    setSelectedFarm,
    welcomeBack,
    enrollmentCode,
    setEnrollmentCode,
    byoDraftConfig,
    setByoDraftConfig,
    byoFarmId,
    setByoFarmId,
    byoActive,
    byoProject,
    freenetOption,
    freenetJoinAvailability: joinAvailability,
    join: { ...join, continue: continueJoin },
    step,
    setStep,
    error,
    lastFarm,
    handleGoogleSignIn,
    handlePinSignIn,
    handleCreateFarm,
    continueAfterRecovery,
    copyRecovery,
    forgetWelcome,
  };
}

export type LoginFlow = ReturnType<typeof useLoginFlow>;
