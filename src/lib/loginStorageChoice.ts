/**
 * Which storage paths the start screen offers, and where it opens.
 *
 * The login screen has to answer two questions before it draws anything: may
 * this build talk about Freenet at all, and has this device already committed
 * to one of the two backends. Keeping that decision here (rather than inline in
 * `Login.tsx`) means the routing can be tested without standing up Firebase.
 *
 * See `Plans/MIST_NETWORK_STORAGE.md` and `Plans/DESKTOP_FREENET_PLUGIN.md` §8.3.
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

export type LoginStep = 'choose' | 'firebase' | 'freenet';

export function freenetOptionState(input: {
  mistEnabled: boolean;
  desktop: boolean;
}): FreenetOptionState {
  if (input.mistEnabled) return 'available';
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
}): LoginStep {
  if (input.freenet === 'hidden') return 'firebase';
  if (input.welcomeBack && input.backend === 'firebase') return 'firebase';
  return 'choose';
}
