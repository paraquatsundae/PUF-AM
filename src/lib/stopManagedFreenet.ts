/**
 * Stop only a Freenet node this bake spawned (desktop child or APK :freenet).
 * Attached / third-party is left. Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-14.
 */

import { shouldOfferStopFreenet } from '../../units/puf-freenet-host/src/quit-ask.ts';
import type { FreenetHostStatus } from '../../units/puf-freenet-host/src/types.ts';
import {
  androidFreenetHostStatusNow,
  androidFreenetHostStop,
  isFreenetHostPluginAvailable,
} from './androidFreenetHost.ts';
import { getDesktopBridge } from './desktopBridge.ts';

export async function stopManagedFreenetHost(): Promise<FreenetHostStatus | null> {
  const desktop = getDesktopBridge();
  if (desktop?.freenet.stop) {
    try {
      return await desktop.freenet.stop();
    } catch {
      return null;
    }
  }
  if (!isFreenetHostPluginAvailable()) return null;
  const now = await androidFreenetHostStatusNow({ probe: true });
  if (!shouldOfferStopFreenet(now.mode)) return now;
  return androidFreenetHostStop();
}
