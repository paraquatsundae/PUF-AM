/**
 * Blight risk card for Farm home.
 *
 * Gates itself: `DashboardPackCards` mounts every registered card, so an
 * inactive pack returns null rather than the page knowing about blight.
 */
import { useEffect, useState } from 'react';
import { Bug, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useWalnutPack } from '../../hooks/useWalnutPack';
import {
  getBlightAggregate,
  isAggregateFresh,
  type BlightAggregate,
  type BlightRiskBand,
} from '../../services/aggregateService';
import { bandFromRisk, RISK_BAND_LABEL } from '../../lib/jiBlightBands';
import {
  DashboardCard,
  dashboardToneText,
  type DashboardCardTone,
} from '../ui/DashboardCard';
import { cn } from '../../lib/utils';

/**
 * Map the Ji daily infection risk to a grower band. Uses the stored band when
 * present (written by the aggregate) and falls back to deriving it from the
 * score so old aggregate docs still render. Matches the BlightRisk page bands.
 */
function riskMeta(agg: BlightAggregate | null): { label: string; tone: DashboardCardTone } {
  const band: BlightRiskBand = agg?.currentBand ?? bandFromRisk(agg?.currentRiskScore ?? 0);
  const label = RISK_BAND_LABEL[band];
  switch (band) {
    case 'action':
      return { label, tone: 'alert' };
    case 'watch':
      return { label, tone: 'watch' };
    default:
      return { label, tone: 'ok' };
  }
}

export function BlightDashboardCard() {
  const { userData, hasModule } = useAuth();
  const farmId = userData?.farmId;
  const hasWalnutPack = useWalnutPack();
  const show = hasWalnutPack && hasModule('blight');

  const [aggregate, setAggregate] = useState<BlightAggregate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!farmId || !show) {
      setAggregate(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getBlightAggregate(farmId)
      .then((agg) => {
        if (!cancelled && agg) setAggregate(agg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [farmId, show]);

  if (!show) return null;

  const risk = riskMeta(aggregate);
  const threat = aggregate?.currentRiskScore ?? 0;
  const fresh = aggregate ? isAggregateFresh(aggregate.lastUpdated) : false;

  return (
    <DashboardCard href="/blight" label="Blight risk" icon={Bug} tone={risk.tone}>
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-slate-400 mt-1" />
      ) : aggregate ? (
        <div className={cn('text-sm font-bold', dashboardToneText(risk.tone))}>
          {risk.label}
          <span className="font-mono font-medium text-slate-600 ml-2">
            {threat < 0.001 ? threat.toExponential(1) : threat.toFixed(3)}
          </span>
          {!fresh && <span className="ml-2 text-[10px] font-medium text-amber-700">stale</span>}
        </div>
      ) : (
        <div className="text-sm text-slate-500">Open blight page for detail</div>
      )}
    </DashboardCard>
  );
}
