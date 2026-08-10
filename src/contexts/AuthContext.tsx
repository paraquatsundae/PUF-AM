import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithCustomToken, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { trackMetric } from '../services/metricsService';
import { resolveIsAdmin } from '../lib/adminAuth';
import { isWorkshopMode, WORKSHOP_USER_DATA } from '../lib/workshopMode';
import { isMistFarmSessionActive, tryLoadMistFarmSession } from '../mist/mistFarmSession.ts';
import {
  clearMistDeviceSession,
  hasMistDeviceSession,
  mistSessionNeedsPin,
} from '../mist/mistDeviceSession.ts';
import { ensureBrowserMistStore, resetBrowserMistStore } from '../mist/createFarmStore.ts';
import { setFarmStoreBackend } from '../mist/farmStoreBackend.ts';
import { createFarmAccount, redeemInvitePin } from '../lib/invitePinAuth';
import {
  clearDeviceRememberedFlag,
  getLastDisplayName,
  getLastFarm,
  markDeviceRemembered,
} from '../lib/deviceSession';
import { clearSessionUnlock } from '../lib/unlockPin';
import type { FarmModuleId } from '../../shared/auth/farmModules';
import {
  allFarmModules,
  effectiveModules,
  resolveFarmEnabledModules,
  sanitizeModules,
} from '../../shared/auth/farmModules';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo?: any[];
  }
}

function isBenignFirestoreFailure(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string })?.code || '';
  return (
    code === 'permission-denied' ||
    code === 'unauthenticated' ||
    code === 'failed-precondition' ||
    msg.includes('permission') ||
    msg.includes('Missing or insufficient permissions') ||
    msg.includes('INTERNAL ASSERTION FAILED') ||
    msg.includes('the client is offline')
  );
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  if (isBenignFirestoreFailure(error)) {
    console.warn(`[Firestore] Soft failure (${operationType}) ${path}:`, error);
    return;
  }
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface UserData {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role: 'admin' | 'farmer' | 'viewer';
  farmId?: string | null;
  modules?: FarmModuleId[];
  authEpoch?: number;
  accessRevoked?: boolean;
  subscriptionTier: 'free' | 'premium';
  hasAgreedToTerms?: boolean;
  agreedToTermsAt?: string;
  createdAt: string;
}

export interface UserPublicData {
  uid: string;
  displayName?: string;
  photoURL?: string;
  role: 'admin' | 'farmer' | 'viewer';
  farmId: string;
}

export interface Farm {
  id: string;
  name: string;
  ownerUid: string;
  createdAt: string;
  enabledModules?: FarmModuleId[];
}

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  pendingInvite: any | null;
  /** Modules this farm offers (owner catalog). */
  farmEnabledModules: FarmModuleId[];
  refreshFarmModules: () => Promise<void>;
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
  logout: () => Promise<void>;
  acceptInvite: () => Promise<void>;
  declineInvite: () => Promise<void>;
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
  const [pendingInvite, setPendingInvite] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [farmEnabledModules, setFarmEnabledModules] =
    useState<FarmModuleId[]>(allFarmModules());
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
    setPendingInvite(null);
    setError(null);
    setFarmEnabledModules(allFarmModules());
    setMistLocked(false);
    return true;
  };

  useEffect(() => {
    if (isWorkshopMode()) {
      setUser(null);
      setUserData(WORKSHOP_USER_DATA as UserData);
      setIsAdmin(true);
      setPendingInvite(null);
      setError(null);
      setFarmEnabledModules(allFarmModules());
      setLoading(false);
      return;
    }

    if (isMistFarmSessionActive()) {
      let cancelled = false;
      void (async () => {
        if (mistSessionNeedsPin()) {
          if (!cancelled) {
            setMistLocked(true);
            setLoading(false);
          }
          return;
        }
        const ok = await applyMistSession();
        if (cancelled) return;
        if (!ok) {
          setError(
            'Mist session could not be restored. Recreate the mist farm or clear site data.',
          );
        }
        setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }

    let unsubscribeDoc: (() => void) | undefined;
    let loadingTimeout: ReturnType<typeof setTimeout> | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      // Use a local variable to track if this specific listener execution is still valid
      // to prevent race conditions from multiple auth state changes
      const currentAuthId = Math.random().toString(36).substring(7);
      (window as any)._lastAuthId = currentAuthId;

      try {
        setUser(currentUser);
        setError(null);
        if (loadingTimeout) clearTimeout(loadingTimeout);
        loadingTimeout = setTimeout(() => {
          console.warn('[Auth] Loading timeout — releasing UI');
          setLoading(false);
        }, 12000);
        
        if (unsubscribeDoc) {
          unsubscribeDoc();
          unsubscribeDoc = undefined;
        }

        if (currentUser) {
          // Restored session = device already remembered (skip login until logout).
          markDeviceRemembered(currentUser.displayName?.trim() || getLastDisplayName());

          const email = currentUser.email;
          let pinAuth = false;
          try {
            const tokenResult = await currentUser.getIdTokenResult();
            pinAuth = tokenResult.claims.pinAuth === true;
          } catch (e) {
            console.error('Error reading token claims:', e);
          }

          // Invite-PIN users are pre-vetted; skip email whitelist/Google invite flow
          if (email && !pinAuth && !email.endsWith('@sentinut.local')) {
            const lowerEmail = email.toLowerCase();
            try {
              // Track reads for access control
              trackMetric('read', 3).catch(console.error); // blacklist, config, whitelist/invite

              // Check blacklist/whitelist
              let blacklistDoc;
              try {
                blacklistDoc = await getDoc(doc(db, 'blacklist', lowerEmail));
              } catch (e) {
                console.error("Error checking blacklist:", e);
              }
              
              if (blacklistDoc?.exists()) {
                await signOut(auth);
                if ((window as any)._lastAuthId === currentAuthId) {
                  setError("Your account has been blacklisted. Please contact the administrator.");
                  setLoading(false);
                }
                return;
              }

              let accessConfig;
              try {
                accessConfig = await getDoc(doc(db, 'config', 'accessControl'));
              } catch (e) {
                console.error("Error checking access config:", e);
              }

              if (accessConfig?.exists() && accessConfig.data().whitelistEnabled) {
                let whitelistDoc;
                try {
                  whitelistDoc = await getDoc(doc(db, 'whitelist', lowerEmail));
                } catch (e) {
                  console.error("Error checking whitelist:", e);
                }

                let hasAdminBypass = false;
                try {
                  const tokenResult = await currentUser.getIdTokenResult();
                  hasAdminBypass = tokenResult.claims.admin === true;
                } catch (e) {
                  console.error("Error checking admin claim:", e);
                }

                if ((!whitelistDoc || !whitelistDoc.exists()) && !hasAdminBypass) {
                  await signOut(auth);
                  if ((window as any)._lastAuthId === currentAuthId) {
                    setError("Your account is not on the whitelist. Please contact the administrator.");
                    setLoading(false);
                  }
                  return;
                }
              }

              // Check for invitations
              let inviteSnap;
              try {
                inviteSnap = await getDoc(doc(db, 'invitations', email.toLowerCase()));
              } catch (e) {
                console.error("Error checking invitations:", e);
              }

              if (inviteSnap?.exists()) {
                const inviteData = inviteSnap.data();
                if ((window as any)._lastAuthId === currentAuthId) {
                  setPendingInvite(inviteData);
                }
              }
            } catch (error) {
              console.error("Error checking access control/invitations:", error);
            }
          }

          if ((window as any)._lastAuthId !== currentAuthId) return;

          const userRef = doc(db, 'users', currentUser.uid);
          
          // Track user profile read
          trackMetric('read').catch(console.error);

          // Ensure user document exists
          let userSnap;
          try {
            // Brief retries — Android WebView/Firestore can report offline for a moment after auth.
            let lastErr: unknown;
            userSnap = undefined as unknown as Awaited<ReturnType<typeof getDoc>>;
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                userSnap = await getDoc(userRef);
                lastErr = undefined;
                break;
              } catch (err) {
                lastErr = err;
                const msg = err instanceof Error ? err.message : String(err);
                if (!msg.includes('offline') || attempt === 2) throw err;
                await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
              }
            }
            if (lastErr) throw lastErr;
          } catch (err: any) {
            console.error("Error fetching user doc:", err);
            if ((window as any)._lastAuthId === currentAuthId) {
              const msg = err instanceof Error ? err.message : String(err);
              setError(
                msg.includes('offline')
                  ? 'Could not load your profile — Firebase looks offline on this device. Ensure the emulator has internet, then sign in again.'
                  : `Could not load your profile: ${msg}`
              );
              setLoading(false);
            }
            return;
          }
          
          if (!userSnap.exists()) {
            // Invite-PIN / create-farm paths write users/{uid} server-side.
            // Do not auto-create a personal farm for PIN users.
            if (pinAuth) {
              if ((window as any)._lastAuthId === currentAuthId) {
                setError('Your account profile is missing. Sign in again with your invite PIN, or ask a farm admin for a new PIN.');
                setLoading(false);
              }
              await signOut(auth);
              return;
            }

            try {
              const farmId = `farm_${currentUser.uid}`;
              const farmRef = doc(db, 'farms', farmId);
              const newFarm: Farm = {
                id: farmId,
                name: `${currentUser.displayName || 'My'}'s Orchard`,
                ownerUid: currentUser.uid,
                createdAt: new Date().toISOString()
              };

              try {
                trackMetric('write').catch(console.error);
                await setDoc(farmRef, newFarm);
              } catch (err) {
                handleFirestoreError(err, OperationType.WRITE, `farms/${farmId}`);
              }

              const newUserData: UserData = {
                uid: currentUser.uid,
                email: currentUser.email || 'no-email@example.com',
                role: 'admin',
                farmId,
                modules: allFarmModules(),
                authEpoch: 1,
                subscriptionTier: 'free',
                createdAt: new Date().toISOString()
              };
              if (currentUser.displayName) newUserData.displayName = currentUser.displayName;
              if (currentUser.photoURL) newUserData.photoURL = currentUser.photoURL;

              try {
                trackMetric('write').catch(console.error);
                await setDoc(userRef, newUserData);
              } catch (err) {
                handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`);
              }

              const publicRef = doc(db, 'users_public', currentUser.uid);
              const publicData: UserPublicData = {
                uid: currentUser.uid,
                displayName: currentUser.displayName || undefined,
                photoURL: currentUser.photoURL || undefined,
                role: 'admin',
                farmId
              };
              try {
                trackMetric('write').catch(console.error);
                await setDoc(publicRef, publicData);
              } catch (err) {
                handleFirestoreError(err, OperationType.WRITE, `users_public/${currentUser.uid}`);
              }
            } catch (err) {
              console.error("Error creating user/farm documents:", err);
              if ((window as any)._lastAuthId === currentAuthId) {
                setError("Failed to initialize your account. Please contact support.");
                setLoading(false);
              }
              return;
            }
          }

          if ((window as any)._lastAuthId !== currentAuthId) return;

          let claimFarmId: string | undefined;
          let claimAuthEpoch = 0;
          try {
            const tokenResult = await currentUser.getIdTokenResult();
            claimFarmId = typeof tokenResult.claims.farmId === 'string' ? tokenResult.claims.farmId : undefined;
            claimAuthEpoch =
              typeof tokenResult.claims.authEpoch === 'number' ? tokenResult.claims.authEpoch : 0;
          } catch {
            /* ignore */
          }

          // Listen to user data changes + hard-revoke kill switch
          unsubscribeDoc = onSnapshot(userRef, async (snap) => {
            if ((window as any)._lastAuthId !== currentAuthId) return;

            if (!snap.exists()) {
              setUserData(null);
              setIsAdmin(false);
              setLoading(false);
              return;
            }

            const data = snap.data() as UserData;
            const revoked =
              data.accessRevoked === true ||
              !data.farmId ||
              (typeof data.authEpoch === 'number' && data.authEpoch > claimAuthEpoch) ||
              (claimFarmId && data.farmId && claimFarmId !== data.farmId);

            if (revoked && pinAuth) {
              clearDeviceRememberedFlag();
              setError('Access removed — ask a farm admin for a new invite PIN.');
              setUserData(null);
              setIsAdmin(false);
              setLoading(false);
              try {
                await signOut(auth);
              } catch {
                /* ignore */
              }
              return;
            }

            // Store raw grant; hasModule / nav intersect with farmEnabledModules.
            setUserData({
              ...data,
              modules: sanitizeModules(data.modules).length
                ? sanitizeModules(data.modules)
                : data.role === 'admin'
                  ? allFarmModules()
                  : (['dashboard'] as FarmModuleId[]),
            });
            if (data.farmId) {
              markDeviceRemembered(data.displayName || getLastDisplayName(), {
                farmId: data.farmId,
                farmName: getLastFarm()?.farmName,
              });
            }
            resolveIsAdmin(data.role).then(setIsAdmin).catch(() => setIsAdmin(data.role === 'admin'));
            setLoading(false);
          }, (err) => {
            console.error("Firestore Error in onSnapshot:", err);
            if ((window as any)._lastAuthId === currentAuthId) {
              setError("Lost connection to your profile. Please check your permissions.");
              setLoading(false);
            }
          });
          if (loadingTimeout) clearTimeout(loadingTimeout);
        } else {
          if ((window as any)._lastAuthId === currentAuthId) {
            setUserData(null);
            setIsAdmin(false);
            setLoading(false);
            if (loadingTimeout) clearTimeout(loadingTimeout);
          }
        }
      } catch (err) {
        console.error("Fatal error in auth state listener:", err);
        if ((window as any)._lastAuthId === currentAuthId) {
          setError("An unexpected authentication error occurred.");
          setLoading(false);
        }
      }
    });

    return () => {
      if (loadingTimeout) clearTimeout(loadingTimeout);
      unsubscribeAuth();
      if (unsubscribeDoc) unsubscribeDoc();
    };
  }, []);

  const signInWithInvitePin = async (
    pin: string,
    displayName: string,
    expectedFarmId?: string,
    farmName?: string
  ) => {
    const { token, farmId } = await redeemInvitePin(pin, displayName, expectedFarmId);
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

  // Farm-level module catalog (owner toggles).
  useEffect(() => {
    if (isWorkshopMode() || isMistFarmSessionActive()) return;
    const farmId = userData?.farmId;
    if (!farmId) {
      setFarmEnabledModules(allFarmModules());
      return;
    }
    const farmRef = doc(db, 'farms', farmId);
    const unsub = onSnapshot(
      farmRef,
      (snap) => {
        setFarmEnabledModules(resolveFarmEnabledModules(snap.data()?.enabledModules));
      },
      (err) => {
        console.warn('[Auth] farm modules listen failed:', err);
        setFarmEnabledModules(allFarmModules());
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

  const hasModule = (moduleId: FarmModuleId) => {
    if (!userData) return false;
    return effectiveModules(userData.role, userData.modules, farmEnabledModules).includes(
      moduleId
    );
  };

  const unlockMistSession = async (devicePin: string): Promise<boolean> => {
    const ok = await applyMistSession(devicePin);
    if (!ok) return false;
    return true;
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

  const acceptInvite = async () => {
    if (!user || !pendingInvite) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      const publicRef = doc(db, 'users_public', user.uid);
      
      // Update both in parallel
      await Promise.all([
        setDoc(userRef, { 
          farmId: pendingInvite.farmId, 
          role: pendingInvite.role 
        }, { merge: true }),
        setDoc(publicRef, {
          farmId: pendingInvite.farmId,
          role: pendingInvite.role
        }, { merge: true })
      ]);
      
      // Delete the invitation
      await deleteDoc(doc(db, 'invitations', user.email!.toLowerCase()));
      setPendingInvite(null);
    } catch (error) {
      console.error("Error accepting invite:", error);
      throw error;
    }
  };

  const declineInvite = async () => {
    if (!user || !pendingInvite) return;
    try {
      await deleteDoc(doc(db, 'invitations', user.email!.toLowerCase()));
      setPendingInvite(null);
    } catch (error) {
      console.error("Error declining invite:", error);
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
        loading,
        error,
        pendingInvite,
        farmEnabledModules,
        refreshFarmModules,
        signInWithInvitePin,
        createFarm,
        completeFarmSignIn,
        logout,
        acceptInvite,
        declineInvite,
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

