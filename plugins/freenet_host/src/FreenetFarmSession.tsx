/**
 * `farmSession` surface — renders nothing; exists to mount the reconciler
 * inside the signed-in tree (Plans/NETWORK_PACK_PLUGIN.md § index.ts).
 */

import { useFreenetHostReconciler } from './useFreenetHostReconciler.ts';

export default function FreenetFarmSession() {
  useFreenetHostReconciler();
  return null;
}
