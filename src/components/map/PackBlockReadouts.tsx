/**
 * The block operate card's pack slot.
 *
 * Mounts every registered `blockOperateReadout` and lets each decide whether it
 * has anything to say about this block — the card must not know which packs
 * exist, and the operate card opens for every area on the farm, not just the
 * ones a given pack cares about.
 *
 * A readout that returns null leaves no trace: `empty:hidden` keeps the card's
 * vertical rhythm intact when no pack contributes.
 */
import { Suspense } from 'react';
import type { OrchardBlock } from '../../lib/mapStore';
import { PACK_UI_REGISTRY } from '../../packs/registry';

export function PackBlockReadouts({ block }: { block: OrchardBlock }) {
  return (
    <div className="space-y-3 empty:hidden">
      {PACK_UI_REGISTRY.map((pack) => {
        const Readout = pack.surfaces.blockOperateReadout;
        if (!Readout) return null;
        return (
          <Suspense key={pack.packId} fallback={null}>
            <Readout block={block} />
          </Suspense>
        );
      })}
    </div>
  );
}
