/**
 * Chill portions card for Farm home.
 *
 * Gates itself: `DashboardPackCards` mounts every registered card, so an
 * inactive pack returns null rather than the page knowing about chill.
 */
import { Loader2, Snowflake } from 'lucide-react';
import { useChillPack } from '../../hooks/useChillPack';
import { useFarmChillPortions } from '../../hooks/useFarmChillPortions';
import { useFarmDiary } from '../../lib/farmDiary';
import { useMapStore } from '../../lib/mapStore';
import { DashboardCard } from '../ui/DashboardCard';

export function ChillDashboardCard() {
  const show = useChillPack();
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

  return (
    <DashboardCard href="/weather-events" label="Chill portions" icon={Snowflake} tone="info">
      {chill.loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-slate-400 mt-1" />
      ) : chill.error ? (
        <div className="text-sm text-rose-600">Unavailable</div>
      ) : (
        <div className="text-sm font-bold text-slate-900">
          <span className="font-mono tabular-nums">{chill.data?.totalPortions ?? '—'} CP</span>
          <span className="ml-2 text-xs font-medium text-slate-500">
            season to date
            {chill.data?.portionsLast24h != null && <> · {chill.data.portionsLast24h} last 24h</>}
          </span>
        </div>
      )}
    </DashboardCard>
  );
}
