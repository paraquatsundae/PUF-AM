/**
 * Seasonal chill portions on the map's block operate card.
 *
 * Farm-level rather than per-block: the figure comes from the viewport's DPIRD
 * station, so every area on the farm reads the same. It sits on the block card
 * because that is where an operator is standing in the orchard asking about
 * this area.
 *
 * Gates on two things. The pack, because `PackBlockReadouts` mounts every
 * registered readout; and a tree or vine block, because chill means nothing on
 * a paddock of cereal. Plain CP with no cultivar target — a cultivar the pack
 * does not know falls back to Chandler, and a false target is worse than none.
 */
import { Loader2, Snowflake } from 'lucide-react';
import { useChillPack } from './useChillPack';
import { useFarmChillPortions } from './useFarmChillPortions';
import { useFarmDiary } from '../../../src/lib/farmDiary';
import { useMapStore } from '../../../src/lib/mapStore';
import { isTreeCropKind } from '../../../shared/farm/farmTypes';
import type { PackBlockReadoutProps } from '../../../src/packs/types';

export function ChillBlockReadout({ block }: PackBlockReadoutProps) {
  const hasChillPack = useChillPack();
  const show = hasChillPack && isTreeCropKind(block.cropKind);
  const { viewport } = useMapStore();
  const { settings } = useFarmDiary();
  const chill = useFarmChillPortions(
    viewport.lat,
    viewport.lng,
    show,
    settings.dpirdStationCode,
    settings.dpirdStationName
  );

  if (!show) return null;

  const caption = chill.error
    ? chill.error
    : [chill.data?.stationName ? `DPIRD ${chill.data.stationName}` : null, chill.data?.seasonLabel]
        .filter(Boolean)
        .join(' · ');

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm gap-3">
        <span className="inline-flex items-center gap-2 text-slate-600">
          <Snowflake className="w-4 h-4 text-sky-600" />
          Chill portions
        </span>
        {chill.loading ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading…
          </span>
        ) : chill.error ? (
          <span className="text-xs font-semibold text-rose-600">Unavailable</span>
        ) : (
          <span className="font-bold font-mono tabular-nums text-slate-900">
            {chill.data?.totalPortions ?? '—'} CP
          </span>
        )}
      </div>
      <p className="text-[10px] text-slate-400 leading-snug">{caption}</p>
    </div>
  );
}
