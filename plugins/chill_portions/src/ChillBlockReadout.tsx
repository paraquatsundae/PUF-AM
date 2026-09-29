/**
 * Seasonal chill portions on the map's block operate card.
 *
 * The figure is the farm station total from `GET /api/weather/chill-portions`
 * (the same hook as the dashboard card — no extra listener, no client DPIRD
 * key). Each variety on the block is scored against the pack catalog.
 *
 * Drawn cultivar parts list every part, then the rest of the paddock under
 * `block.cultivar`. A blank name says so. A name with no published requirement
 * says the requirement is not set — it does not borrow another variety's number.
 */
import { Loader2, Snowflake } from 'lucide-react';
import { useChillPack } from './useChillPack';
import { useFarmChillPortions } from './useFarmChillPortions';
import { useFarmDiary } from '../../../src/lib/farmDiary';
import { useMapStore } from '../../../src/lib/mapStore';
import { isTreeCropKind } from '../../../shared/farm/farmTypes';
import type { PackBlockReadoutProps } from '../../../src/packs/types';
import { SHADE_CLASS, shadeForFraction } from '../../../shared/shadeForFraction';
import {
  chillRequirementLabel,
  chillVarietiesOnBlock,
  lookupChillRequirement,
} from './chillCrops';

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
  const achieved = chill.data?.totalPortions;
  const varieties = chillVarietiesOnBlock(block);

  return (
    <div className="space-y-1.5">
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
        ) : null}
      </div>
      <ul className="space-y-1">
        {varieties.map((row, index) => {
          const known = row.cultivar ? lookupChillRequirement(row.cultivar) : null;
          const required = known?.requiredCP;
          const requirement =
            known && typeof required === 'number' ? chillRequirementLabel(known) : null;
          const shade =
            !chill.loading &&
            !chill.error &&
            typeof achieved === 'number' &&
            typeof required === 'number'
              ? shadeForFraction(achieved / required)
              : null;
          const title = row.cultivar
            ? known
              ? known.name
              : row.cultivar
            : 'No variety set';
          return (
            <li
              key={`${row.rest ? 'rest' : 'part'}-${index}`}
              className={`rounded-lg px-2 py-1.5 ${shade ? SHADE_CLASS[shade] : 'bg-slate-50'}`}
            >
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-semibold text-slate-900 min-w-0">
                  {title}
                  {known ? (
                    <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      {known.cropName}
                    </span>
                  ) : null}
                </span>
                <span className="font-mono tabular-nums text-xs font-semibold text-slate-800 shrink-0">
                  {row.cultivar
                    ? requirement
                      ? `${achieved ?? '—'} / ${requirement}`
                      : 'Requirement not set'
                    : null}
                </span>
              </div>
              {row.rest ? (
                <p className="text-[10px] text-slate-500 leading-snug">Rest of paddock</p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {caption ? <p className="text-[10px] text-slate-400 leading-snug">{caption}</p> : null}
    </div>
  );
}
