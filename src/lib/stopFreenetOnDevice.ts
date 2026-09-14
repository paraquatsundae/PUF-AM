/**
 * Settings kill switch — stop PUF-AM’s Freenet on this device.
 *
 * Sets hold-off first so the reconciler cannot race a start. Quit / leave-farm
 * still uses `stopManagedFreenetHost` (managed only).
 * Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-14 (kill switch).
 */

import { killSwitchHonestMessage, leftoverAfterKillSwitch } from '../../units/puf-freenet-host/src/kill-switch.ts';
import type {
  FreenetHostStatus,
  FreenetKillSwitchOptions,
  FreenetKillSwitchResult,
  FreenetLeftoverKind,
} from '../../units/puf-freenet-host/src/types.ts';
import {
  androidFreenetHostStatus,
  androidFreenetHostStopAllOurs,
  isFreenetHostPluginAvailable,
} from './androidFreenetHost.ts';
import { getDesktopBridge } from './desktopBridge.ts';
import { setFreenetHostHoldOff } from './freenetHostHoldOff.ts';
import { markLocalFreenetNodeStopped } from '../mist/freenetLocalNode.ts';

export type { FreenetKillSwitchResult, FreenetKillSwitchOptions };

function asResult(
  status: FreenetHostStatus | null,
  over: Partial<FreenetKillSwitchResult> = {},
): FreenetKillSwitchResult {
  const base = status ?? androidFreenetHostStatus();
  const leftover: FreenetLeftoverKind =
    over.leftover ??
    base.leftover ??
    leftoverAfterKillSwitch({ portStillFreenet: base.reachable === true });
  return {
    ...base,
    leftover,
    leftoverPackage: over.leftoverPackage ?? base.leftoverPackage,
    portFree: over.portFree ?? leftover === 'none',
    stoppedOurs: over.stoppedOurs ?? ('stoppedOurs' in base && base.stoppedOurs === true),
  };
}

export function freenetKillSwitchCopy(result: FreenetKillSwitchResult): string {
  return killSwitchHonestMessage({ leftover: result.leftover, stoppedOurs: result.stoppedOurs });
}

export async function stopFreenetOnThisDevice(
  options: FreenetKillSwitchOptions = {},
): Promise<FreenetKillSwitchResult> {
  setFreenetHostHoldOff(true);
  markLocalFreenetNodeStopped();
  const desktop = getDesktopBridge();
  if (desktop?.freenet.stopAllOurs) {
    try {
      const after = await desktop.freenet.stopAllOurs(options);
      return asResult(after, { stoppedOurs: after.stoppedOurs });
    } catch {
      return asResult(null, { leftover: 'none', portFree: false, stoppedOurs: false });
    }
  }
  if (desktop?.freenet.stop) {
    try {
      const after = await desktop.freenet.stop();
      return asResult(after, {
        leftover: leftoverAfterKillSwitch({ portStillFreenet: after?.reachable === true }),
        stoppedOurs: after?.mode === 'stopped',
        portFree: after?.reachable !== true,
      });
    } catch {
      return asResult(null);
    }
  }
  if (!isFreenetHostPluginAvailable()) {
    return asResult(androidFreenetHostStatus(), { leftover: 'none', portFree: true });
  }
  const after = await androidFreenetHostStopAllOurs();
  return asResult(after, { stoppedOurs: after.stoppedOurs });
}
