/**
 * Workshop mode: local UI without Google auth / Firestore farm docs.
 * Enable explicitly with VITE_WORKSHOP_MODE=true (not auto-on in DEV —
 * unauthenticated Firestore watches caused INTERNAL ASSERTION crashes).
 */
export function isWorkshopMode(): boolean {
  if (import.meta.env.VITE_REQUIRE_AUTH === 'true') return false;
  return import.meta.env.VITE_WORKSHOP_MODE === 'true';
}

/** True when we must not open live Firestore farm listeners. */
export function isLocalOnlyFarmSession(): boolean {
  return isWorkshopMode();
}

export const WORKSHOP_USER_DATA = {
  uid: 'workshop_local',
  email: 'workshop@local.dev',
  displayName: 'Workshop User',
  role: 'admin' as const,
  farmId: 'farm_workshop',
  subscriptionTier: 'free' as const,
  hasAgreedToTerms: true,
  createdAt: new Date().toISOString(),
};
