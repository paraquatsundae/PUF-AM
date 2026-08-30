import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  User,
  browserPopupRedirectResolver,
  signInWithCustomToken,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import { isWorkshopMode } from '../lib/workshopMode';
import { isMistFarmSessionActive, tryLoadMistFarmSession } from '../mist/mistFarmSession.ts';
import {
  clearMistDeviceSession,
  hasMistDeviceSession,
} from '../mist/mistDeviceSession.ts';
import { ensureBrowserMistStore, resetBrowserMistStore } from '../mist/createFarmStore.ts';
import { setFarmStoreBackend } from '../mist/farmStoreBackend.ts';
import { createFarmAccount, redeemInvitePin } from '../lib/invitePinAuth';
import { isByoFirebase } from '../lib/byoFirebaseConfig';
import { BYO_SESSION_TOKEN } from '../lib/byoFirebaseAuth';
import {
  clearDeviceRememberedFlag,
  getLastFarm,
  markDeviceRemembered,
} from '../lib/deviceSession';
import { clearSessionUnlock } from '../lib/unlockPin';
import { subscribeAuthSession } from '../lib/authSessionListen';
import type { FarmModuleId } from '../../shared/auth/farmModules';
import {
  allFarmModules,
  effectiveModules,
  resolveFarmEnabledModules,
} from '../../shared/auth/farmModules';
import {
  offeredFarmModules,
  resolveFarmCropPacks,
  type FarmCropPacksMap,
} from '../../shared/farm/cropPacks';

export type { Farm, UserData, UserPublicData } from '../lib/authTypes';
import type { UserData } from '../lib/authTypes';

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  isAdmin: boolean;
  /** Platform claim only — whitelist / Admin page. Not farm-role admin. */
  isPlatformAdmin: boolean;
  loading: boolean;
  error: string | null;
  /** Modules this farm offers (owner catalog). */
  farmEnabledModules: FarmModuleId[];
  refreshFarmModules: () => Promise<void>;
  /** Installed crop packs on this farm (Plans/CROP_PACK_PLUGIN.md). */
  farmCropPacks: FarmCropPacksMap;
  refreshFarmCropPacks: () => Promise<void>;
  signInWithInvitePin: (
    pin: string,
    displayName: string,
    expectedFarmId?: string,
    farmName?: string
  ) => Promise<void>;
  createFarm: (
    farmName: string,
    displayName: string,
    opts?: { lat?: number; lng?: number; showNearby?: boolean; enrollmentCode?: string }
  ) => Promise<{ recoveryPin: string; token: string; farmId: string; farmName: string }>;
  completeFarmSignIn: (
    token: string,
    displayName: string,
    farm?: { farmId?: string; farmName?: string }
  ) => Promise<void>;
  /** Returning Google / platform-admin accounts on PUFworks cloud. */
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  agreeToTerms: () => Promise<void>;
  hasModule: (moduleId: FarmModuleId) => boolean;
  /** True when mist session exists but device PIN unlock is pending. */
  mistLocked: boolean;
  /** Unlock mist session with 4-digit device PIN; returns false on wrong PIN. */
  unlockMistSession: (devicePin: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [farmEnabledModules, setFarmEnabledModules] =
    useState<FarmModuleId[]>(allFarmModules());
  const [farmCropPacks, setFarmCropPacks] = useState<FarmCropPacksMap>({});
  const [mistLocked, setMistLocked] = useState(false);

  const applyMistSession = async (devicePin?: string): Promise<boolean> => {
    const loaded = await tryLoadMistFarmSession(devicePin);
    if (!loaded) return false;
    await ensureBrowserMistStore();
    setUser(null);
    setUserData(loaded.userData);
    // Was hardcoded true, which handed a join-ticket viewer the Admin nav and
    // the model-parameter engine. The session's own role is the answer: an
    // owner or admin still resolves to `admin`, and a device with no recorded
    // role predates join tickets, so it minted this farm and is one.
    setIsAdmin(loaded.userData.role === 'admin');
    setIsPlatformAdmin(false);
    setError(null);
    setFarmEnabledModules(allFarmModules());
    setMistLocked(false);
    return true;
  };

  useEffect(
    () =>
      subscribeAuthSession({
        setUser,
        setUserData,
        setIsAdmin,
        setIsPlatformAdmin,
        setLoading,
        setError,
        setFarmEnabledModules,
        setMistLocked,
        applyMistSession,
      }),
    []
  );

  const signInWithInvitePin = async (
    pin: string,
    displayName: string,
    expectedFarmId?: string,
    farmName?: string
  ) => {
    const { token, farmId } = await redeemInvitePin(pin, displayName, expectedFarmId);
    if (token === BYO_SESSION_TOKEN || isByoFirebase()) {
      markDeviceRemembered(displayName, {
        farmId,
        farmName: farmName || getLastFarm()?.farmName,
      });
      return;
    }
    try {
      await signInWithCustomToken(auth, token);
      markDeviceRemembered(displayName, {
        farmId,
        farmName: farmName || getLastFarm()?.farmName,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('offline') || msg.includes('network')) {
        throw new Error(
          'Firebase could not reach the network from this device. Check emulator internet (not airplane mode), then try again.'
        );
      }
      throw err;
    }
  };

  const createFarm = async (
    farmName: string,
    displayName: string,
    opts?: { lat?: number; lng?: number; showNearby?: boolean; enrollmentCode?: string }
  ) => {
    const { token, recoveryPin, farmId } = await createFarmAccount(farmName, displayName, opts);
    return { recoveryPin, token, farmId, farmName };
  };

  const completeFarmSignIn = async (
    token: string,
    displayName: string,
    farm?: { farmId?: string; farmName?: string }
  ) => {
    if (token === BYO_SESSION_TOKEN || isByoFirebase()) {
      markDeviceRemembered(displayName, farm);
      return;
    }
    try {
      await signInWithCustomToken(auth, token);
      markDeviceRemembered(displayName, farm);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('offline') || msg.includes('network')) {
        throw new Error(
          'Firebase could not reach the network from this device. Check emulator internet (not airplane mode), then try again.'
        );
      }
      throw err;
    }
  };

  // Farm-level module catalog + crop packs (owner toggles).
  useEffect(() => {
    if (isWorkshopMode() || isMistFarmSessionActive()) return;
    const farmId = userData?.farmId;
    if (!farmId) {
      setFarmEnabledModules(allFarmModules());
      setFarmCropPacks({});
      return;
    }
    const farmRef = doc(db, 'farms', farmId);
    const unsub = onSnapshot(
      farmRef,
      (snap) => {
        const data = snap.data();
        setFarmEnabledModules(resolveFarmEnabledModules(data?.enabledModules));
        setFarmCropPacks(resolveFarmCropPacks(data?.cropPacks));
      },
      (err) => {
        console.warn('[Auth] farm modules listen failed:', err);
        setFarmEnabledModules(allFarmModules());
        setFarmCropPacks({});
      }
    );
    return () => unsub();
  }, [userData?.farmId]);

  const refreshFarmModules = async () => {
    const farmId = userData?.farmId;
    if (!farmId || isWorkshopMode() || isMistFarmSessionActive()) {
      setFarmEnabledModules(allFarmModules());
      return;
    }
    try {
      const snap = await getDoc(doc(db, 'farms', farmId));
      setFarmEnabledModules(resolveFarmEnabledModules(snap.data()?.enabledModules));
    } catch (e) {
      console.warn('[Auth] refreshFarmModules failed:', e);
    }
  };

  const refreshFarmCropPacks = async () => {
    const farmId = userData?.farmId;
    if (!farmId || isWorkshopMode() || isMistFarmSessionActive()) {
      setFarmCropPacks({});
      return;
    }
    try {
      const snap = await getDoc(doc(db, 'farms', farmId));
      setFarmCropPacks(resolveFarmCropPacks(snap.data()?.cropPacks));
    } catch (e) {
      console.warn('[Auth] refreshFarmCropPacks failed:', e);
    }
  };

  const hasModule = (moduleId: FarmModuleId) => {
    if (!userData) return false;
    const offered = offeredFarmModules(farmEnabledModules, farmCropPacks);
    return effectiveModules(userData.role, userData.modules, offered).includes(moduleId);
  };

  const unlockMistSession = async (devicePin: string): Promise<boolean> => {
    const ok = await applyMistSession(devicePin);
    if (!ok) return false;
    return true;
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider, browserPopupRedirectResolver);
  };

  const logout = async () => {
    try {
      if (isMistFarmSessionActive() || hasMistDeviceSession()) {
        clearMistDeviceSession();
        await resetBrowserMistStore(true);
        setFarmStoreBackend('firebase');
        setUser(null);
        setUserData(null);
        setIsAdmin(false);
        setIsPlatformAdmin(false);
        setMistLocked(false);
        clearSessionUnlock();
        return;
      }
      clearDeviceRememberedFlag();
      clearSessionUnlock();
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out', error);
      throw error;
    }
  };

  const agreeToTerms = async () => {
    if (!user) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        hasAgreedToTerms: true,
        agreedToTermsAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userData,
        isAdmin,
        isPlatformAdmin,
        loading,
        error,
        farmEnabledModules,
        refreshFarmModules,
        farmCropPacks,
        refreshFarmCropPacks,
        signInWithInvitePin,
        createFarm,
        completeFarmSignIn,
        signInWithGoogle,
        logout,
        agreeToTerms,
        hasModule,
        mistLocked,
        unlockMistSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

