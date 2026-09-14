/**
 * Farm feed pack — UI registration.
 *
 * Derives For you / Everyone from issues, highlights, and diary this farm
 * already syncs. No new Freenet contract. No new Firestore collection.
 * Plans/FARM_MESSAGING.md
 */
import { IconBell } from '@tabler/icons-react';
import type { FarmPackUiRegistration } from '../../../src/packs/types';
import {
  FARM_FEED_PACK_ID,
  FARM_FEED_PRIMARY_PATH,
} from '../../../shared/farm/farmFeedPackage';
import { lazyWithRetry } from '../../../src/lib/lazyWithRetry';

const FarmFeedPage = lazyWithRetry(() =>
  import('./FarmFeedPage').then((m) => ({ default: m.FarmFeedPage }))
);
const FarmFeedDashboardCard = lazyWithRetry(() =>
  import('./FarmFeedDashboardCard').then((m) => ({ default: m.FarmFeedDashboardCard }))
);

const feedPath = FARM_FEED_PRIMARY_PATH.replace(/^\//, '');

export const packUi: FarmPackUiRegistration = {
  packId: FARM_FEED_PACK_ID,
  routes: [
    {
      path: feedPath,
      moduleId: 'farm_feed',
      Page: FarmFeedPage,
    },
  ],
  navItems: [
    {
      groupId: 'field',
      name: 'Farm feed',
      href: FARM_FEED_PRIMARY_PATH,
      icon: IconBell,
      moduleId: 'farm_feed',
    },
  ],
  surfaces: {
    dashboardCard: FarmFeedDashboardCard,
  },
};

export { FARM_FEED_PRIMARY_PATH } from '../../../shared/farm/farmFeedPackage';
