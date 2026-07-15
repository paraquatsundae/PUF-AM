import { getAuth } from 'firebase/auth';

/** Admin check via Firebase custom claims (Step 13). Falls back to Firestore role in dev. */
export async function resolveIsAdmin(firestoreRole?: string): Promise<boolean> {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return false;

  try {
    const token = await user.getIdTokenResult();
    if (token.claims.admin === true) return true;
  } catch (error) {
    console.warn('[adminAuth] Token claim check failed:', error);
  }

  return firestoreRole === 'admin';
}
