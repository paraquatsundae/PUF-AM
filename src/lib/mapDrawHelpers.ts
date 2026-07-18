/**
 * Lifecycle helpers for leaflet-draw handlers started outside EditControl
 * (Quick Add + / programmatic enable). Prevents orphaned drawers after tab switches.
 */

export type LeafletDrawHandler = {
  enable: () => void;
  disable: () => void;
};

export function cancelActiveDrawer(ref: { current: LeafletDrawHandler | null }): void {
  const drawer = ref.current;
  if (!drawer) return;
  try {
    drawer.disable();
  } catch {
    // Handler may already be torn down by leaflet-draw
  }
  ref.current = null;
}

export function startActiveDrawer(
  ref: { current: LeafletDrawHandler | null },
  drawer: LeafletDrawHandler
): void {
  cancelActiveDrawer(ref);
  drawer.enable();
  ref.current = drawer;
}
