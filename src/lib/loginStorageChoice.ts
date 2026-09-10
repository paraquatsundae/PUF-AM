/**
 * Which storage paths the start screen offers, and where it opens.
 *
 * The login screen has to answer two questions before it draws anything: can
 * this device do Freenet at all, and has this device already committed to one
 * of the two backends. Keeping that decision here (rather than inline in
 * `Login.tsx`) means the routing can be tested without standing up Firebase.
 *
 * Since 2026-09-10 (Plans/FREENET_NETWORK_PACK.md decision 5) the first answer
 * comes from the shell's *host capability*, not from a build flag: the hosted
 * web bundle has no node, so it hides Freenet however it was built.
 *
 * See `Plans/reference/MIST_NETWORK_STORAGE.md`, `Plans/FIREBASE_BILLING.md` §2–§4,
 * `Plans/reference/DESKTOP_FREENET_PLUGIN.md` §8.3, `Plans/NETWORK_PACK_PLUGIN.md`.
 */

import type { FarmStoreBackendPreference } from '../mist/farmStoreBackend.ts';
import type { FreenetHostCapability } from './freenetHostCapability.ts';

/** How the Freenet (mist) option is presented on the start screen. */
export type FreenetOptionState =
  /** Gate is open — the operator can start or recover a mist farm now. */
  | 'available'
  /**
   * Desktop shell with mist switched off. The node lives in this app, so the
   * option is shown greyed with a pointer at the Settings toggle instead of
   * pretending the feature does not exist.
   */
  | 'needs-setting'
  /** No host capability here (hosted web, or an APK with the gate shut): Firebase is the only path. */
  | 'hidden';

export type LoginStep =
  | 'choose'
  | 'cloud-options'
  | 'cloud-byo'
  | 'cloud-byo-setup'
  | 'cloud-byo-config'
  | 'cloud-byo-rules'
  | 'cloud-subscribe'
  | 'firebase'
  | 'freenet-explain';

export function freenetOptionState(input: {
  /** What this shell can host — `getFreenetHostCapability()`. `null` on the web. */
  capability: FreenetHostCapability;
  /** The mist experimental gate (`isMistExperimentalEnabled()`). */
  mistEnabled: boolean;
  /**
   * `npm run dev` on this laptop. A fresh operator must be able to start a
   * farm with no Firebase and no enrollment code, and the dev server *is* the
   * node's sidecar — so the workshop hub is a capability of its own.
   */
  workshopHub?: boolean;
  /**
   * Capacitor APK. It cannot host a node until Phase 3, but with the mist gate
   * open it reads a Freenet farm through a paired laptop hub or a sideloaded
   * node (`Plans/reference/APK_FREENET_PLUGIN.md` §7), so the option stays.
   */
  nativeReader?: boolean;
}): FreenetOptionState {
  if (input.workshopHub) return 'available';
  if (input.capability === 'electron') return input.mistEnabled ? 'available' : 'needs-setting';
  if (input.capability === 'android') return 'available';
  if (input.nativeReader && input.mistEnabled) return 'available';
  return 'hidden';
}

/**
 * A device that already knows which farm it signed into should land on that
 * flow, not on a chooser — the storage question is only interesting the first
 * time, or after the operator deliberately clears the session.
 */
export function initialLoginStep(input: {
  freenet: FreenetOptionState;
  welcomeBack: boolean;
  backend: FarmStoreBackendPreference;
  /** This device already pasted a bring-your-own Firebase config. */
  byoConfigured?: boolean;
}): LoginStep {
  if (input.byoConfigured) return 'firebase';
  if (input.welcomeBack && input.backend === 'firebase') return 'firebase';
  if (input.freenet === 'hidden') return 'cloud-options';
  return 'choose';
}
