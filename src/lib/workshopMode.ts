/**
 * Workshop mode: local UI without Google auth / Firestore farm docs.
 * Enable explicitly with VITE_WORKSHOP_MODE=true (not auto-on in DEV —
 * unauthenticated Firestore watches caused INTERNAL ASSERTION crashes).
 */
import { allFarmModules, type FarmModuleId } from '../../shared/auth/farmModules';

export function isWorkshopMode(): boolean {
  if (import.meta.env.VITE_REQUIRE_AUTH === 'true') return false;
  return import.meta.env.VITE_WORKSHOP_MODE === 'true';
}

/** True when we must not open live Firestore farm listeners. */
export function isLocalOnlyFarmSession(): boolean {
  return isWorkshopMode();
}

/**
 * True where raw diagnostics surfaces (every knob, hash and status string) are
 * worth their clutter: an explicit workshop build, or a `npm run dev` bench.
 *
 * A packaged AppImage or APK is somebody's farm, so those surfaces stay off
 * there even when the Freenet paths themselves are enabled — the operator gets
 * the task-shaped cards instead. Kept separate from `isWorkshopMode()` because
 * that one also swaps in a fake signed-in user, which a bench run must not do.
 */
export function isWorkshopDiagnosticsEnabled(): boolean {
  return isWorkshopMode() || import.meta.env.DEV === true;
}

export const WORKSHOP_USER_DATA: {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin';
  farmId: string;
  modules: FarmModuleId[];
  authEpoch: number;
  subscriptionTier: 'free';
  hasAgreedToTerms: boolean;
  createdAt: string;
} = {
  uid: 'workshop_local',
  email: 'workshop@local.dev',
  displayName: 'Workshop User',
  role: 'admin',
  farmId: 'farm_workshop',
  modules: allFarmModules(),
  authEpoch: 1,
  subscriptionTier: 'free',
  hasAgreedToTerms: true,
  createdAt: new Date().toISOString(),
};
