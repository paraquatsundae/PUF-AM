/**
 * Which pipes a farm actually has, so Settings can stop offering the other one.
 *
 * A farm is created against exactly one off-device backend — Cloud sync
 * (Firebase) or the Offline Freenet network — and that choice is made on the
 * login storage chooser before anything else happens. Nothing in the app lets a
 * farm hold both, but Settings used to show both sets of controls to everyone,
 * so a Freenet operator was offered **Flush to cloud** and a cloud operator was
 * offered a Freenet join ticket. Both are dead buttons for the farm in front of
 * them.
 *
 * Wi‑Fi (LAN) is not part of the exclusive choice: the `.pufom` shelf and hub
 * discovery are how any device hands a farm to any other device on the same
 * network, whichever backend the farm was created against.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §1
 */

import { isMistFarmSessionActive } from '../mist/mistFarmSession.ts';
import { isWorkshopDiagnosticsEnabled } from './workshopMode.ts';

/** The one off-device backend this farm was created against. */
export type FarmPipe = 'cloud' | 'freenet';

export type FarmPipes = {
  /** Always available — LAN shelf, hub discovery, push/pull. */
  lan: true;
  /** Firebase: outbox flush, invite PINs, cloud presence. */
  cloud: boolean;
  /** Freenet: send a farm, join with a ticket. */
  freenet: boolean;
  /** Always available — `.pufom`, JSON/Excel, offline weather. */
  files: true;
};

/**
 * Read from the live session rather than a stored preference on its own: the
 * backend preference says which store the app *would* use, while a decrypted
 * device session says a Freenet farm is actually open here. `Login.tsx` writes
 * the preference, so the pair together is the source of truth.
 */
export function activeFarmPipe(): FarmPipe {
  return isMistFarmSessionActive() ? 'freenet' : 'cloud';
}

export function isFreenetFarm(): boolean {
  return activeFarmPipe() === 'freenet';
}

export function isCloudFarm(): boolean {
  return activeFarmPipe() === 'cloud';
}

export function activeFarmPipes(): FarmPipes {
  const pipe = activeFarmPipe();
  return { lan: true, cloud: pipe === 'cloud', freenet: pipe === 'freenet', files: true };
}

/**
 * Whether the Freenet send/join card belongs on this page.
 *
 * The XOR rule is about operators, and a bench is not an operator: a workshop
 * or `npm run dev` session signs in as a fake cloud user, yet sending and
 * joining a farm over Freenet is exactly what it is there to exercise. Hiding
 * the card by pipe alone would take that away from the only session that tests
 * it, so the one hole in the rule is written down beside the rule.
 */
export function showFreenetFarmTools(): boolean {
  return isFreenetFarm() || isWorkshopDiagnosticsEnabled();
}

/** What the Sync tab calls this farm's second pipe, in the operator's words. */
export function farmPipeLabel(pipe: FarmPipe = activeFarmPipe()): string {
  return pipe === 'freenet' ? 'Freenet' : 'Cloud sync';
}
