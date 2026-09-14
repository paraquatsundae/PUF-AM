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
   * Leftover: Electron used to grey Freenet until a Settings toggle. The AppImage
   * now starts its bundled node itself (FarmCode / create is the opt-in).
   */
  | 'needs-setting'
  /** No host capability here (hosted web, or an APK with the gate shut): Firebase is the only path. */
  | 'hidden';

export type LoginStep =
  | 'join'
  | 'create-choose'
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
   * Capacitor APK. With the mist gate open it offers Freenet: the in-APK node
   * on :7509, or attach if something else is already bound there.
   */
  nativeReader?: boolean;
}): FreenetOptionState {
  if (input.workshopHub) return 'available';
  // Bundled linux-x64 in the AppImage — same as in-APK libfreenet.so. Opening a
  // Freenet farm starts the node; MIST_FREENET=1 is a workshop override only.
  if (input.capability === 'electron' || input.capability === 'android') return 'available';
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
  return 'join';
}
