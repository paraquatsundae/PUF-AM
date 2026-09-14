/**
 * Operator paused Freenet on this device (Settings kill switch).
 *
 * Session-only: the reconciler must not immediately respawn. Cleared when
 * they leave the farm, switch farms, or tap Start. Survives Settings remount.
 * Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-14 (kill switch).
 * Plans/NAMING.md §5 `pufam.freenet.hostHoldOff.v1`.
 */

export const FREENET_HOST_HOLD_OFF_KEY = 'pufam.freenet.hostHoldOff.v1';

type Listener = () => void;
const listeners = new Set<Listener>();

function ss(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

function notify(): void {
  for (const fn of listeners) fn();
}

export function isFreenetHostHoldOff(): boolean {
  return ss()?.getItem(FREENET_HOST_HOLD_OFF_KEY) === '1';
}

export function setFreenetHostHoldOff(paused: boolean): void {
  const store = ss();
  if (paused) store?.setItem(FREENET_HOST_HOLD_OFF_KEY, '1');
  else store?.removeItem(FREENET_HOST_HOLD_OFF_KEY);
  notify();
}

export function clearFreenetHostHoldOff(): void {
  setFreenetHostHoldOff(false);
}

/** Leave farm or switch farm — the next open may start one node. */
export function releaseFreenetHostHoldOffOnFarmChange(
  previousFarmId: string | null | undefined,
  nextFarmId: string | null | undefined,
): boolean {
  const left = Boolean(previousFarmId) && !nextFarmId;
  const switched = Boolean(previousFarmId && nextFarmId && previousFarmId !== nextFarmId);
  if (!left && !switched) return false;
  if (!isFreenetHostHoldOff()) return false;
  clearFreenetHostHoldOff();
  return true;
}

export function subscribeFreenetHostHoldOff(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
