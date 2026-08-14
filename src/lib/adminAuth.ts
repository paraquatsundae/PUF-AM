import { getAuth } from 'firebase/auth';

/** Farm-role or platform admin — Settings, crop packs, blight knobs. */
export async function resolveIsAdmin(firestoreRole?: string): Promise<boolean> {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return false;

  try {
    const token = await user.getIdTokenResult();
    if (isPlatformAdminClaims(token.claims)) return true;
    if (token.claims.role === 'admin') return true;
  } catch (error) {
    console.warn('[adminAuth] Token claim check failed:', error);
  }

  return firestoreRole === 'admin';
}

/** Matches firestore.rules `isPlatformAdmin()` — not farm-role `admin`. */
export function isPlatformAdminClaims(claims: Record<string, unknown>): boolean {
  if (claims.platformAdmin === true) return true;
  return claims.admin === true && claims.pinAuth !== true && claims.role == null;
}

export async function resolveIsPlatformAdmin(): Promise<boolean> {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return false;
  try {
    const token = await user.getIdTokenResult();
    return isPlatformAdminClaims(token.claims);
  } catch (error) {
    console.warn('[adminAuth] Platform admin claim check failed:', error);
    return false;
  }
}
