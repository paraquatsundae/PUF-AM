import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithCustomToken, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { trackMetric } from '../services/metricsService';
import { resolveIsAdmin } from '../lib/adminAuth';
import { isWorkshopMode, WORKSHOP_USER_DATA } from '../lib/workshopMode';
import { redeemInvitePin } from '../lib/invitePinAuth';

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
  farmId?: string;
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
}

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  pendingInvite: any | null;
  signInWithInvitePin: (pin: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  acceptInvite: () => Promise<void>;
  declineInvite: () => Promise<void>;
  agreeToTerms: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isWorkshopMode()) {
      setUser(null);
      setUserData(WORKSHOP_USER_DATA as UserData);
      setIsAdmin(true);
      setPendingInvite(null);
      setError(null);
      setLoading(false);
      return;
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
            try {
              const farmId = `farm_${currentUser.uid}`;
              
              // Create the farm first
              const farmRef = doc(db, 'farms', farmId);
              const newFarm: Farm = {
                id: farmId,
                name: `${currentUser.displayName || 'My'}'s Orchard`,
                ownerUid: currentUser.uid,
                createdAt: new Date().toISOString()
              };
              
              try {
                // Track write
                trackMetric('write').catch(console.error);
                await setDoc(farmRef, newFarm);
              } catch (err) {
                handleFirestoreError(err, OperationType.WRITE, `farms/${farmId}`);
              }

              const newUserData: UserData = {
                uid: currentUser.uid,
                email: currentUser.email || 'no-email@example.com',
                role: 'admin', // Creator of the farm is the admin
                farmId: farmId,
                subscriptionTier: 'free',
                createdAt: new Date().toISOString()
              };
              if (currentUser.displayName) newUserData.displayName = currentUser.displayName;
              if (currentUser.photoURL) newUserData.photoURL = currentUser.photoURL;

              try {
                // Track write
                trackMetric('write').catch(console.error);
                await setDoc(userRef, newUserData);
              } catch (err) {
                handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`);
              }

              // Create public profile
              const publicRef = doc(db, 'users_public', currentUser.uid);
              const publicData: UserPublicData = {
                uid: currentUser.uid,
                displayName: currentUser.displayName || undefined,
                photoURL: currentUser.photoURL || undefined,
                role: 'admin',
                farmId: farmId
              };
              try {
                // Track write
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
          } else {
            // Check if existing user needs a farmId
            const data = userSnap.data() as UserData;
            if (!data.farmId) {
              try {
                const farmId = `farm_${currentUser.uid}`;
                const farmRef = doc(db, 'farms', farmId);
                
                // Create farm if it doesn't exist
                const farmSnap = await getDoc(farmRef);

                if (!farmSnap.exists()) {
                  const newFarm: Farm = {
                    id: farmId,
                    name: `${data.displayName || 'My'}'s Orchard`,
                    ownerUid: currentUser.uid,
                    createdAt: new Date().toISOString()
                  };
                  await setDoc(farmRef, newFarm);
                }
                
                await setDoc(userRef, { 
                  farmId: farmId, 
                  role: 'admin',
                  subscriptionTier: data.subscriptionTier || 'free',
                  createdAt: data.createdAt || new Date().toISOString(),
                  uid: currentUser.uid,
                  email: currentUser.email || data.email
                }, { merge: true });

                // Update public profile
                const publicRef = doc(db, 'users_public', currentUser.uid);
                await setDoc(publicRef, {
                  uid: currentUser.uid,
                  displayName: currentUser.displayName || data.displayName || undefined,
                  photoURL: currentUser.photoURL || data.photoURL || undefined,
                  role: 'admin',
                  farmId: farmId
                }, { merge: true });
              } catch (err) {
                console.error("Error initializing farmId for existing user:", err);
              }
            }
          }

          if ((window as any)._lastAuthId !== currentAuthId) return;

          // Listen to user data changes
          unsubscribeDoc = onSnapshot(userRef, (doc) => {
            if ((window as any)._lastAuthId !== currentAuthId) return;
            
            if (doc.exists()) {
              const data = doc.data() as UserData;
              setUserData(data);
              resolveIsAdmin(data.role).then(setIsAdmin).catch(() => setIsAdmin(data.role === 'admin'));
            } else {
              setUserData(null);
              setIsAdmin(false);
            }
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

  const signInWithInvitePin = async (pin: string, displayName: string) => {
    const { token } = await redeemInvitePin(pin, displayName);
    try {
      await signInWithCustomToken(auth, token);
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

  const logout = async () => {
    try {
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
    <AuthContext.Provider value={{ user, userData, isAdmin, loading, error, pendingInvite, signInWithInvitePin, logout, acceptInvite, declineInvite, agreeToTerms }}>
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

