import { Link } from 'react-router-dom';
import { BookOpen, ClipboardList, Flag, Loader2, Snowflake, X } from 'lucide-react';
import type { OrchardBlock } from '../../lib/mapStore';
import { resolveCultivarTarget } from '../../lib/chillPortions';
import { cn } from '../../lib/utils';
import {
  areaWordForCropKind,
  getEnterprise,
  isTreeCropKind,
  type FarmEnterpriseId,
} from '../../../shared/farm/farmTypes';

export type ChillDisplay = {
  portions: number | null;
  loading: boolean;
  error: string | null;
  stationName?: string;
  seasonLabel?: string;
};

type Props = {
  block: OrchardBlock;
  openIssues: number;
  chill: ChillDisplay;
  onClose: () => void;
  onViewIssues: () => void;
  onReportIssue: () => void;
};

export function BlockOperateCard({
  block,
  openIssues,
  chill,
  onClose,
  onViewIssues,
  onReportIssue,
}: Props) {
  const tree = isTreeCropKind(block.cropKind);
  const cultivar = resolveCultivarTarget(block.cultivar);
  const met =
    chill.portions != null && chill.portions >= cultivar.requiredCP;
  const subtitle = tree
    ? [block.species, block.cultivar?.trim() || null].filter(Boolean).join(' · ') ||
      'Species not set'
    : block.seasonLabel ||
      block.cultivar?.trim() ||
      (block.cropKind
        ? getEnterprise(block.cropKind as FarmEnterpriseId).label
        : 'Crop not set');

  return (
    <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900 truncate">
            {block.name || `Unnamed ${areaWordForCropKind(block.cropKind)}`}
            <span className="font-semibold text-slate-500">
              {' · '}
              {subtitle}
            </span>
          </h3>
          {typeof block.areaHa === 'number' && (
            <p className="text-xs text-slate-500 mt-0.5">{block.areaHa.toFixed(2)} ha</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 pb-3 space-y-2.5">
        <button
          type="button"
          onClick={onViewIssues}
          className="w-full flex items-center justify-between text-sm rounded-lg hover:bg-slate-50 -mx-1 px-1 py-1 transition-colors"
        >
          <span className="inline-flex items-center gap-2 text-slate-600">
            <ClipboardList className="w-4 h-4 text-amber-600" />
            Open issues
          </span>
          <span className={cn('font-bold', openIssues > 0 ? 'text-amber-700' : 'text-slate-700')}>
            {openIssues === 0 ? 'None' : openIssues}
            {openIssues > 0 && (
              <span className="ml-1.5 text-xs font-semibold text-amber-600/80">View</span>
            )}
          </span>
        </button>

        {tree ? (
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
                <span
                  className={cn(
                    'font-bold font-mono tabular-nums',
                    met ? 'text-emerald-700' : 'text-slate-900'
                  )}
                >
                  {chill.portions ?? '—'}/{cultivar.requiredCP}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 leading-snug">
              {chill.error
                ? chill.error
                : [
                    chill.stationName ? `DPIRD ${chill.stationName}` : null,
                    chill.seasonLabel,
                    cultivar.sourceKind === 'ucanr'
                      ? 'Req: UCANR'
                      : cultivar.sourceKind === 'luedeling'
                        ? 'Req: Luedeling 2009'
                        : 'Req: estimate',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
            </p>
          </div>
        ) : null}
      </div>

      <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/80 flex items-center justify-between gap-3">
        <Link
          to={`/diary?block=${encodeURIComponent(block.id)}`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
        >
          <BookOpen className="w-4 h-4" />
          Open diary
        </Link>
        <button
          type="button"
          onClick={onReportIssue}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 hover:text-amber-800"
        >
          <Flag className="w-4 h-4" />
          Report
        </button>
      </div>
    </div>
  );
}
