/**
 * Settings kill switch — stop PUF-AM’s Freenet on this device.
 *
 * Distinct from quit Keep / Stop. Quit never kills attached. This path
 * stops our child and a same-uid listener we own, then tells the truth
 * about leftovers (Freenet Android Node cannot be force-stopped).
 * Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-14 (kill switch).
 */

import type { FreenetListenerKind } from './listener-owner.ts';
import type { FreenetHostMode, FreenetLeftoverKind } from './types.ts';

export const FREENET_ANDROID_NODE_PACKAGE = 'org.freenet.androidnode';

export const FREENET_KILL_SWITCH_LABEL = 'Stop Freenet on this device';
export const FREENET_START_ON_DEVICE_LABEL = 'Start Freenet';
export const FREENET_OPEN_ANDROID_NODE_LABEL = 'Open that app';
export const FREENET_STOP_USER_SERVICE_ASK = 'Stop the Freenet service on this computer?';
export const FREENET_STOP_USER_SERVICE_CONFIRM = 'Stop the Freenet service';
export const FREENET_KILL_SWITCH_HINT =
  'Stops PUF-AM’s Freenet node on this device and keeps it off until you open a farm again or tap Start. This is not the quit question (Keep running vs Stop).';

export const FREENET_KILL_STOPPED_OURS =
  'Stopped PUF-AM’s Freenet node on this device. Port 7509 is free.';
export const FREENET_KILL_NOTHING_OURS = 'Nothing for PUF-AM to stop. Port 7509 is free.';
export const FREENET_KILL_ANDROID_NODE_LEFT =
  'Stopped PUF-AM’s node. Freenet Android Node is still running — we cannot force-stop it. Open that app to stop it there.';
export const FREENET_KILL_LOGIN_SERVICE_LEFT =
  'Stopped this AppImage’s node. The Freenet service on this computer is still running.';
export const FREENET_KILL_OURS_LEFT = 'PUF-AM’s Freenet node is still on :7509. Try Stop again.';
export const FREENET_KILL_FOREIGN_LEFT =
  'Stopped PUF-AM’s node. Something else is still answering on :7509. We did not stop it.';

/** Same-uid AppImage / bundled binary — kill switch may SIGTERM. */
export function maySignalAttachedListener(kind: FreenetListenerKind | null | undefined): boolean {
  return kind === 'ours' || kind === 'other-appimage';
}

export function leftoverAfterKillSwitch(input: {
  portStillFreenet: boolean;
  listenerKind?: FreenetListenerKind | null;
  packagesForUid?: readonly string[] | null;
}): FreenetLeftoverKind {
  if (!input.portStillFreenet) return 'none';
  const packages = input.packagesForUid ?? [];
  if (packages.includes(FREENET_ANDROID_NODE_PACKAGE)) return 'android-node';
  if (input.listenerKind === 'ours' || input.listenerKind === 'other-appimage') return 'ours';
  if (input.listenerKind === 'login-leftover') return 'login-service';
  return 'foreign';
}

export function killSwitchHonestMessage(input: {
  leftover: FreenetLeftoverKind;
  stoppedOurs: boolean;
}): string {
  if (input.leftover === 'android-node') return FREENET_KILL_ANDROID_NODE_LEFT;
  if (input.leftover === 'login-service') return FREENET_KILL_LOGIN_SERVICE_LEFT;
  if (input.leftover === 'ours') return FREENET_KILL_OURS_LEFT;
  if (input.leftover === 'foreign') return FREENET_KILL_FOREIGN_LEFT;
  return input.stoppedOurs ? FREENET_KILL_STOPPED_OURS : FREENET_KILL_NOTHING_OURS;
}

/** Kill switch is on the Settings card whenever this shell has a Freenet host. */
export function shouldOfferKillSwitch(
  mode: FreenetHostMode | null | undefined,
  leftover?: FreenetLeftoverKind | null,
): boolean {
  if (leftover && leftover !== 'none') return true;
  return (
    mode === 'managed' ||
    mode === 'starting' ||
    mode === 'attached' ||
    mode === 'stopped' ||
    mode === 'failed'
  );
}

export function shouldOfferStartFreenet(
  mode: FreenetHostMode | null | undefined,
  holdOff: boolean,
  leftover?: FreenetLeftoverKind | null,
): boolean {
  if (holdOff) return true;
  if (leftover && leftover !== 'none') return true;
  return mode === 'stopped' || mode === 'failed' || !mode;
}

export function shouldConfirmStopUserService(
  leftover: FreenetLeftoverKind | null | undefined,
  alreadyConfirmed: boolean,
): boolean {
  return leftover === 'login-service' && !alreadyConfirmed;
}

/** Never claim we killed Freenet Android Node. */
export function claimedKilledAndroidNode(input: {
  leftover: FreenetLeftoverKind;
  message: string;
}): boolean {
  if (input.leftover === 'android-node') {
    return /force-stop|we stopped it|killed it|stopped Freenet Android Node/i.test(input.message)
      && !/cannot force-stop/i.test(input.message);
  }
  return /stopped Freenet Android Node/i.test(input.message);
}
