/**
 * One farm Send at a time — Hot + bones + ticket stay one job.
 *
 * Native PUTs are also queued in `sendNativeRequest`. This lock stops a
 * second Send / auto-sync from stacking another farm publish.
 * Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-14 (Send native PUT settle).
 */

import { FREENET_PUT_ALREADY_IN_PROGRESS } from '../../units/puf-freenet-host/src/put-ready.ts';

let inFlight = false;

export function freenetFarmPublishInFlight(): boolean {
  return inFlight;
}

export async function withFreenetFarmPublishLock<T>(run: () => Promise<T>): Promise<T> {
  if (inFlight) throw new Error(FREENET_PUT_ALREADY_IN_PROGRESS);
  inFlight = true;
  try {
    return await run();
  } finally {
    inFlight = false;
  }
}

export function resetFreenetFarmPublishLockForTests(): void {
  inFlight = false;
}
