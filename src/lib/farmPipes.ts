/**
 * Which pipes a farm actually has, so Settings can stop offering the other one.
 *
 * A farm is created against exactly one off-device backend — Cloud sync
 * (Firebase) or the Offline Freenet network — and that choice is made on the
 * login storage chooser before anything else happens. Settings used to show
 * both sets of controls to everyone, so a Freenet operator was offered **Flush
 * to cloud** and a cloud operator was offered a Freenet join ticket. Both are
 * dead buttons for the farm in front of them.
 *
 * Since 2026-09-11 a cloud farm can *also* carry a Freenet plane — the
 * `freenet_host` network pack's **hybrid** mode (`Plans/FREENET_NETWORK_PACK.md`
 * §3). Firestore stays the authority; Freenet holds a sealed mirror and the
 * join/recovery plane. That is the third state below, and it comes in two
 * flavours that the helpers keep apart:
 *
 * - a **member device** — signed into Firebase, holding the FarmCode for the
 *   mirror: cloud controls *and* Send this farm;
 * - a **mirror device** — joined over Freenet with a ticket, no Firebase
 *   membership: read-only, pull only, "join with an invite PIN to edit".
 *
 * Wi‑Fi (LAN) is not part of the exclusive choice: the `.pufom` shelf and hub
 * discovery are how any device hands a farm to any other device on the same
 * network, whichever backend the farm was created against.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §1
 */

import { isMistFarmSessionActive } from '../mist/mistFarmSession.ts';
import {
  getMistSessionMeta,
  hasMistDeviceSession,
  mistSessionCloudFarmId,
} from '../mist/mistDeviceSession.ts';
import { isWorkshopDiagnosticsEnabled } from './workshopMode.ts';

/**
 * The off-device backend(s) this farm has. `hybrid` is a cloud farm with a
 * Freenet mirror; whether this device is a member or a mirror of it is
 * `isCloudMirror()`.
 */
export type FarmPipe = 'cloud' | 'freenet' | 'hybrid';

export type FarmPipes = {
  /** Always available — LAN shelf, hub discovery, push/pull. */
  lan: true;
  /** Firebase: outbox flush, invite PINs, cloud presence. False on a mirror device. */
  cloud: boolean;
  /** Freenet: send a farm, join with a ticket. True for `freenet` and `hybrid`. */
  freenet: boolean;
  /** Always available — `.pufom`, JSON/Excel, offline weather. */
  files: true;
  /** This device is a read-only Freenet mirror of a cloud farm. */
  cloudMirror: boolean;
};

/**
 * Read from the live session rather than a stored preference on its own: the
 * backend preference says which store the app *would* use, while a decrypted
 * device session says a Freenet farm is actually open here. `Login.tsx` writes
 * the preference, so the pair together is the source of truth.
 *
 * `cloudFarmId` lets a caller that knows which Firestore farm is open (the
 * reconciler, the plugin tile) refuse a seed that belongs to a different cloud
 * farm — the device slot holds one seed, and an operator who switches farms
 * must not see the previous farm's mirror controls.
 */
export function activeFarmPipe(cloudFarmId?: string | null): FarmPipe {
  const mirrored = mistSessionCloudFarmId();
  if (isMistFarmSessionActive()) return mirrored ? 'hybrid' : 'freenet';
  if (!mirrored) return 'cloud';
  if (cloudFarmId && cloudFarmId !== mirrored) return 'cloud';
  return 'hybrid';
}

export function isFreenetFarm(): boolean {
  return activeFarmPipe() === 'freenet';
}

export function isCloudFarm(): boolean {
  return activeFarmPipe() === 'cloud';
}

export function isHybridFarm(cloudFarmId?: string | null): boolean {
  return activeFarmPipe(cloudFarmId) === 'hybrid';
}

/**
 * A device that joined a hybrid farm over Freenet. It holds the FarmCode and can
 * read the sealed mirror, but has no Firebase membership — Firestore is the
 * authority for this farm, so nothing edited here goes anywhere.
 */
export function isCloudMirror(): boolean {
  return isMistFarmSessionActive() && mistSessionCloudFarmId() !== null;
}

/** The Firestore farm a hybrid device's seed belongs to, or `null`. */
export function mirroredCloudFarmId(): string | null {
  return mistSessionCloudFarmId();
}

/**
 * The mist FarmId the Freenet plane is addressed under, or `null` with no seed
 * here. On a Freenet farm or a mirror device it is the open farm's id; on a
 * hybrid member device it differs from the cloud farm id the app is signed into,
 * and is what tickets, publish status and the sealed blobs are keyed by.
 */
export function freenetPlaneFarmId(): string | null {
  if (!hasMistDeviceSession()) return null;
  const id = getMistSessionMeta()?.farmId?.trim();
  return id ? id : null;
}

/**
 * Whether anything Freenet-shaped belongs on this device's Settings — a
 * Freenet-native farm, or a hybrid farm's member or mirror device.
 */
export function hasFreenetPlane(cloudFarmId?: string | null): boolean {
  return activeFarmPipe(cloudFarmId) !== 'cloud';
}

/**
 * Whether the operator signs into this farm with a FarmCode / device PIN
 * rather than a Firebase account — true for a Freenet farm and for a mirror
 * device, false for a hybrid member device, which is a cloud login that happens
 * to hold a seed as well.
 */
export function isFarmCodeSession(): boolean {
  return isMistFarmSessionActive();
}

/** A sealed FarmSeed sits on this device, whichever farm it belongs to. */
export function hasSealedFarmSeed(): boolean {
  return hasMistDeviceSession();
}

export function activeFarmPipes(cloudFarmId?: string | null): FarmPipes {
  const pipe = activeFarmPipe(cloudFarmId);
  const cloudMirror = pipe === 'hybrid' && isCloudMirror();
  return {
    lan: true,
    cloud: pipe === 'cloud' || (pipe === 'hybrid' && !cloudMirror),
    freenet: pipe !== 'cloud',
    files: true,
    cloudMirror,
  };
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
export function showFreenetFarmTools(cloudFarmId?: string | null): boolean {
  return hasFreenetPlane(cloudFarmId) || isWorkshopDiagnosticsEnabled();
}

/** What the Sync tab calls this farm's second pipe, in the operator's words. */
export function farmPipeLabel(pipe: FarmPipe = activeFarmPipe()): string {
  if (pipe === 'freenet') return 'Freenet';
  if (pipe === 'hybrid') return 'Cloud sync + Freenet mirror';
  return 'Cloud sync';
}
