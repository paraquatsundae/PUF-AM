/**
 * Colour scale for a fraction of a target. Any pack can call this.
 * Under 25% red, 25% orange, 50% yellow, 75% cyan, 100% and above blue.
 */

export type Shade = 'red' | 'orange' | 'yellow' | 'cyan' | 'blue';

/** Tailwind background for each shade. The whole styling surface. */
export const SHADE_CLASS: Record<Shade, string> = {
  red: 'bg-red-100',
  orange: 'bg-orange-100',
  yellow: 'bg-yellow-100',
  cyan: 'bg-cyan-100',
  blue: 'bg-blue-100',
};

/** Non-finite or negative fractions are red. */
export function shadeForFraction(fraction: number): Shade {
  if (!Number.isFinite(fraction) || fraction < 0.25) return 'red';
  if (fraction < 0.5) return 'orange';
  if (fraction < 0.75) return 'yellow';
  if (fraction < 1) return 'cyan';
  return 'blue';
}
