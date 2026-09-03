/**
 * Leaf wetness duration estimated from rainfall and humidity.
 *
 * A weather derivation, not a disease one. Every daily observation the app
 * stores carries a `WD` figure — the DPIRD cache, the met.no forecast and the
 * scheduled refresh all compute it, on farms with no interest in blight — so
 * this belongs beside the weather sources rather than inside a pack.
 *
 * It lived in `jiBlightModel.ts` because the Ji model was its first consumer,
 * which made the whole weather pipeline import a blight engine to fill in one
 * column. That is the coupling `Plans/PLUGIN_PACK_LAYOUT.md` Phase 0 lists as a
 * misfiled core utility to move into core.
 *
 * Interim only: a real leaf wetness sensor supersedes it.
 */

/** Interim LWD when no sensor: rain intensity + high RH (local Mathematica notebook). */
export function estimateWetnessHoursProxy(R: number, RH: number): number {
  const fromRain = R > 0.2 ? 5 + 0.8 * R : 0;
  const fromHumidity = RH > 82 ? 5 : 0;
  return Math.min(18, fromRain + fromHumidity);
}
