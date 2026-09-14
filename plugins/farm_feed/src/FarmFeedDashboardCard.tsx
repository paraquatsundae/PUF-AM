import { Megaphone } from 'lucide-react';
import { DashboardCard } from '../../../src/components/ui/DashboardCard';
import { FARM_FEED_PRIMARY_PATH } from '../../../shared/farm/farmFeedPackage';
import { useFarmFeed } from './useFarmFeed';
import { useFarmFeedPack } from './useFarmFeedPack';

export function FarmFeedDashboardCard() {
  const show = useFarmFeedPack();
  const feed = useFarmFeed();

  if (!show) return null;

  const tone = feed.unreadForYou > 0 ? 'watch' : 'info';

  return (
    <DashboardCard href={FARM_FEED_PRIMARY_PATH} label="Farm feed" icon={Megaphone} tone={tone}>
      <div className="text-sm font-bold text-slate-900">
        {feed.unreadForYou > 0 ? (
          <>
            <span className="tabular-nums">{feed.unreadForYou}</span>
            <span className="ml-2 text-xs font-medium text-amber-800">
              For you
            </span>
          </>
        ) : (
          <span className="text-xs font-medium text-slate-500">
            {feed.forYou.length > 0
              ? `${feed.forYou.length} for you · all caught up`
              : 'Everyone + directed pings'}
          </span>
        )}
      </div>
    </DashboardCard>
  );
}
