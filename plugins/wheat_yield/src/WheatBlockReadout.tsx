import { Wheat } from 'lucide-react';
import { Link } from 'react-router-dom';
import { WHEAT_YIELD_PRIMARY_PATH } from '../../../shared/farm/wheatYieldPackage';
import type { PackBlockReadoutProps } from '../../../src/packs/types';
import { estimateYield } from './estimateYield';
import { useWheatPack } from './useWheatPack';
import { useWheatScout } from './useWheatScout';
import { isWheatScoutPaddock } from './wheatPaddock';
import { useAuth } from '../../../src/contexts/AuthContext';

function tonnes(value: number): string {
  return value.toLocaleString('en-AU', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

export function WheatBlockReadout({ block }: PackBlockReadoutProps) {
  const active = useWheatPack();
  const { userData } = useAuth();
  const show = active && isWheatScoutPaddock(block);
  const scout = useWheatScout(show ? userData?.farmId : undefined, show ? block.id : undefined);

  if (!show) return null;

  const result = scout.record
    ? estimateYield({
        counts: scout.record.counts,
        hectolitreWeight: scout.record.hectolitreWeight,
        deductionPercent: scout.record.deductionPercent,
        hectares: scout.record.hectares,
        thousandGrainWeightOverride: scout.record.thousandGrainWeightOverride,
      })
    : null;

  return (
    <div className="space-y-1 text-sm min-w-0">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-slate-600">
          <Wheat className="w-4 h-4 text-amber-600 shrink-0" />
          Wheat yield
        </span>
        <Link to={`${WHEAT_YIELD_PRIMARY_PATH}?paddock=${encodeURIComponent(block.id)}`} className="text-xs font-semibold text-emerald-700">
          Scout
        </Link>
      </div>
      {scout.loading ? (
        <p className="text-xs text-slate-500">Loading scout…</p>
      ) : result && result.countCount > 0 ? (
        <p className="text-slate-800 break-words">
          <span className="font-semibold">{tonnes(result.tonnesPerHa)} t/ha</span>
          <span className="text-slate-500"> · {tonnes(result.totalTonnes)} t on {tonnes(scout.record?.hectares ?? 0)} ha</span>
        </p>
      ) : (
        <p className="text-xs text-slate-500">No head counts saved for this paddock.</p>
      )}
    </div>
  );
}
