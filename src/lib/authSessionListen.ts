import {
  User,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { handleFirestoreError, OperationType } from './firestoreErrors';
import { trackMetric } from '../services/metricsService';
import { resolveIsAdmin, resolveIsPlatformAdmin } from './adminAuth';
import { isWorkshopMode, WORKSHOP_USER_DATA } from './workshopMode';
import { isMistFarmSessionActive } from '../mist/mistFarmSession.ts';
import { mistSessionNeedsPin } from '../mist/mistDeviceSession.ts';
import {
  markDeviceRemembered,
  getLastDisplayName,
  getLastFarm,
  clearDeviceRememberedFlag,
} from './deviceSession';
import { isByoFirebase } from './byoFirebaseConfig';
import { isByoAuthEmail } from '../../shared/auth/byoPin';
import {
  allFarmModules,
  sanitizeModules,
  type FarmModuleId,
} from '../../shared/auth/farmModules';
import type { Farm, UserData } from './authTypes';

export type AuthSessionSetters = {
  setUser: (user: User | null) => void;
  setUserData: (data: UserData | null) => void;
  setIsAdmin: (value: boolean) => void;
  setIsPlatformAdmin: (value: boolean) => void;
  setLoading: (value: boolean) => void;
  setError: (error: string | null) => void;
  setFarmEnabledModules: (modules: FarmModuleId[]) => void;
  setMistLocked: (locked: boolean) => void;
  applyMistSession: (devicePin?: string) => Promise<boolean>;
};

/**
 * Workshop / mist / Firebase session subscribe.
 * Lives in lib so AuthContext never imports hooks.
 */
export function subscribeAuthSession(s: AuthSessionSetters): () => void {
  if (isWorkshopMode()) {
    s.setUser(null);
    s.setUserData(WORKSHOP_USER_DATA as UserData);
    s.setIsAdmin(true);
    s.setIsPlatformAdmin(true);
    s.setError(null);
    s.setFarmEnabledModules(allFarmModules());
    s.setLoading(false);
    return () => undefined;
  }

  if (isMistFarmSessionActive()) {
    let cancelled = false;
    void (async () => {
      if (mistSessionNeedsPin()) {
        if (!cancelled) {
          s.setMistLocked(true);
          s.setLoading(false);
        }
        return;
      }
      const ok = await s.applyMistSession();
      if (cancelled) return;
      if (!ok) {
        s.setError(
          'Mist session could not be restored. Recreate the mist farm or clear site data.',
        );
      }
      s.setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }

  let unsubscribeDoc: (() => void) | undefined;
  let loadingTimeout: ReturnType<typeof setTimeout> | undefined;

  const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
    const currentAuthId = Math.random().toString(36).substring(7);
    (window as any)._lastAuthId = currentAuthId;

    try {
      s.setUser(currentUser);
      s.setError(null);
      if (loadingTimeout) clearTimeout(loadingTimeout);
      loadingTimeout = setTimeout(() => {
        console.warn('[Auth] Loading timeout — releasing UI');
        s.setLoading(false);
      }, 12000);

      if (unsubscribeDoc) {
        unsubscribeDoc();
        unsubscribeDoc = undefined;
      }

      if (currentUser) {
        markDeviceRemembered(currentUser.displayName?.trim() || getLastDisplayName());

        const email = currentUser.email;
        let pinAuth = false;
        try {
          const tokenResult = await currentUser.getIdTokenResult();
          pinAuth = tokenResult.claims.pinAuth === true;
        } catch (e) {
          console.error('Error reading token claims:', e);
        }

        if (
          email &&
          !pinAuth &&
          !email.endsWith('@sentinut.local') &&
          !isByoAuthEmail(email) &&
          !isByoFirebase()
        ) {
          const lowerEmail = email.toLowerCase();
          try {
            trackMetric('read', 3).catch(console.error);

            let blacklistDoc;
            try {
              blacklistDoc = await getDoc(doc(db, 'blacklist', lowerEmail));
            } catch (e) {
              console.error('Error checking blacklist:', e);
            }

            if (blacklistDoc?.exists()) {
              await signOut(auth);
              if ((window as any)._lastAuthId === currentAuthId) {
                s.setError('Your account has been blacklisted. Please contact the administrator.');
                s.setLoading(false);
              }
              return;
            }

            let accessConfig;
            try {
              accessConfig = await getDoc(doc(db, 'config', 'accessControl'));
            } catch (e) {
              console.error('Error checking access config:', e);
            }

            if (accessConfig?.exists() && accessConfig.data().whitelistEnabled) {
              let whitelistDoc;
              try {
                whitelistDoc = await getDoc(doc(db, 'whitelist', lowerEmail));
              } catch (e) {
                console.error('Error checking whitelist:', e);
              }

              let hasAdminBypass = false;
              try {
                const tokenResult = await currentUser.getIdTokenResult();
                hasAdminBypass = tokenResult.claims.admin === true;
              } catch (e) {
                console.error('Error checking admin claim:', e);
              }

              if ((!whitelistDoc || !whitelistDoc.exists()) && !hasAdminBypass) {
                await signOut(auth);
                if ((window as any)._lastAuthId === currentAuthId) {
                  s.setError('Your account is not on the whitelist. Please contact the administrator.');
                  s.setLoading(false);
                }
                return;
              }
            }
          } catch (error) {
            console.error('Error checking access control:', error);
          }
        }

        if ((window as any)._lastAuthId !== currentAuthId) return;

        const userRef = doc(db, 'users', currentUser.uid);
        trackMetric('read').catch(console.error);

        let userSnap;
        try {
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
          console.error('Error fetching user doc:', err);
          if ((window as any)._lastAuthId === currentAuthId) {
            const msg = err instanceof Error ? err.message : String(err);
            s.setError(
              msg.includes('offline')
                ? 'Could not load your profile — Firebase looks offline on this device. Ensure the emulator has internet, then sign in again.'
                : `Could not load your profile: ${msg}`
            );
            s.setLoading(false);
          }
          return;
        }

        if (!userSnap.exists()) {
          if (pinAuth || isByoFirebase() || isByoAuthEmail(currentUser.email)) {
            if ((window as any)._lastAuthId === currentAuthId) {
              s.setError('Your account profile is missing. Sign in again with your invite PIN, or ask a farm admin for a new PIN.');
              s.setLoading(false);
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
            const publicData = {
              uid: currentUser.uid,
              displayName: currentUser.displayName || undefined,
              photoURL: currentUser.photoURL || undefined,
              role: 'admin' as const,
              farmId
            };
            try {
              trackMetric('write').catch(console.error);
              await setDoc(publicRef, publicData);
            } catch (err) {
              handleFirestoreError(err, OperationType.WRITE, `users_public/${currentUser.uid}`);
            }
          } catch (err) {
            console.error('Error creating user/farm documents:', err);
            if ((window as any)._lastAuthId === currentAuthId) {
              s.setError('Failed to initialize your account. Please contact support.');
              s.setLoading(false);
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

        unsubscribeDoc = onSnapshot(userRef, async (snap) => {
          if ((window as any)._lastAuthId !== currentAuthId) return;

          if (!snap.exists()) {
            s.setUserData(null);
            s.setIsAdmin(false);
            s.setIsPlatformAdmin(false);
            s.setLoading(false);
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
            s.setError('Access removed — ask a farm admin for a new invite PIN.');
            s.setUserData(null);
            s.setIsAdmin(false);
            s.setIsPlatformAdmin(false);
            s.setLoading(false);
            try {
              await signOut(auth);
            } catch {
              /* ignore */
            }
            return;
          }

          s.setUserData({
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
          resolveIsAdmin(data.role).then(s.setIsAdmin).catch(() => s.setIsAdmin(data.role === 'admin'));
          resolveIsPlatformAdmin().then(s.setIsPlatformAdmin).catch(() => s.setIsPlatformAdmin(false));
          s.setLoading(false);
        }, (err) => {
          console.error('Firestore Error in onSnapshot:', err);
          if ((window as any)._lastAuthId === currentAuthId) {
            s.setError('Lost connection to your profile. Please check your permissions.');
            s.setLoading(false);
          }
        });
        if (loadingTimeout) clearTimeout(loadingTimeout);
      } else {
        if ((window as any)._lastAuthId === currentAuthId) {
          s.setUserData(null);
          s.setIsAdmin(false);
          s.setIsPlatformAdmin(false);
          s.setLoading(false);
          if (loadingTimeout) clearTimeout(loadingTimeout);
        }
      }
    } catch (err) {
      console.error('Fatal error in auth state listener:', err);
      if ((window as any)._lastAuthId === currentAuthId) {
        s.setError('An unexpected authentication error occurred.');
        s.setLoading(false);
      }
    }
  });

  return () => {
    if (loadingTimeout) clearTimeout(loadingTimeout);
    unsubscribeAuth();
    if (unsubscribeDoc) unsubscribeDoc();
  };
}
