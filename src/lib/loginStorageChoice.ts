/**
 * Which storage paths the start screen offers, and where it opens.
 *
 * The login screen has to answer two questions before it draws anything: may
 * this build talk about Freenet at all, and has this device already committed
 * to one of the two backends. Keeping that decision here (rather than inline in
 * `Login.tsx`) means the routing can be tested without standing up Firebase.
 *
 * See `Plans/MIST_NETWORK_STORAGE.md`, `Plans/FIREBASE_BILLING.md` §2–§4,
 * `Plans/DESKTOP_FREENET_PLUGIN.md` §8.3.
 */

import type { FarmStoreBackendPreference } from '../mist/farmStoreBackend.ts';

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
  /** Plain web / Capacitor build: Firebase is the only path, as in production. */
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
  mistEnabled: boolean;
  desktop: boolean;
  /**
   * `npm run dev` on this laptop. A fresh operator must be able to start a
   * farm with no Firebase and no enrollment code — the production web build
   * still hides Freenet unless the mist flag is baked in.
   */
  workshopHub?: boolean;
}): FreenetOptionState {
  if (input.mistEnabled || input.workshopHub) return 'available';
  return input.desktop ? 'needs-setting' : 'hidden';
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
