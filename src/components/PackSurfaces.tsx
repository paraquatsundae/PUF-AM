/**
 * Mount every pack component registered for one named surface.
 *
 * The generic sibling of `DashboardPackCards`: core names the *slot*, never the
 * pack, and each surface decides for itself whether it applies to this farm and
 * this device (most render null when it does not). Surfaces are registered
 * lazily, so each gets its own Suspense boundary and no fallback — a slot that
 * is still downloading should take up no room, not show a spinner.
 *
 * Extra props go straight through to the surface, which is how the login
 * explainer receives its option state and the plugin tile its catalog entry.
 *
 * @see Plans/NETWORK_PACK_PLUGIN.md § Surfaces
 */
import { Suspense, type ReactNode } from 'react';
import { packSurfaces } from '../packs/registry';
import type { PackSurfaceComponents } from '../packs/types';

export function PackSurfaces({
  surface,
  ...props
}: { surface: keyof PackSurfaceComponents } & Record<string, unknown>) {
  const entries = packSurfaces(surface);
  if (entries.length === 0) return null;
  return (
    <>
      {entries.map(({ packId, Surface }) => (
        <Suspense key={packId} fallback={null}>
          <Surface {...props} />
        </Suspense>
      ))}
    </>
  );
}

/** True when at least one pack registered the surface — for core fallbacks. */
export function hasPackSurface(surface: keyof PackSurfaceComponents): boolean {
  return packSurfaces(surface).length > 0;
}

/**
 * Wrap `children` in every registered `sessionGate`, outermost first in
 * catalog order. Gates are eager by contract, so no Suspense here: a boundary
 * with a null fallback would blank the app for a frame the gate exists to hold.
 */
export function PackSessionGates({ children }: { children: ReactNode }) {
  return packSurfaces('sessionGate').reduceRight<ReactNode>(
    (inner, { packId, Surface }) => <Surface key={packId}>{inner}</Surface>,
    children
  );
}
