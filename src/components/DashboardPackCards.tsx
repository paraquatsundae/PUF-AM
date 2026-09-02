/**
 * The Farm home pack-card slot.
 *
 * Mounts every registered `dashboardCard` and lets each one decide whether it
 * applies to this farm — the page must not know which packs exist. Because a
 * card can render null, the section can end up with no children at all, so
 * `empty:hidden` stops it consuming a gap in the page's vertical rhythm.
 */
import { Suspense } from 'react';
import { PACK_UI_REGISTRY } from '../packs/registry';

export function DashboardPackCards() {
  return (
    <section className="space-y-3 empty:hidden">
      {PACK_UI_REGISTRY.map((pack) => {
        const Card = pack.surfaces.dashboardCard;
        if (!Card) return null;
        return (
          <Suspense key={pack.packId} fallback={null}>
            <Card />
          </Suspense>
        );
      })}
    </section>
  );
}
