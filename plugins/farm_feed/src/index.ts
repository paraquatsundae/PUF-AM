/**
 * Farm feed pack — UI registration.
 *
 * Derives For you / Everyone from issues, highlights, and diary this farm
 * already syncs. Whole-farm chat is a capped log (hosted: one doc; Freenet:
 * HotKey on hot/current). No DMs. No new Freenet slot.
 * Plans/FARM_MESSAGING.md
 */
import { IconBell } from '@tabler/icons-react';
import type { FarmPackUiRegistration } from '../../../src/packs/types';
import {
  FARM_FEED_PACK_ID,
  FARM_FEED_PRIMARY_PATH,
} from '../../../shared/farm/farmFeedPackage';
import { lazyWithRetry } from '../../../src/lib/lazyWithRetry';
import { registerFarmChatHotBridge } from '../../../src/mist/hotFarmChatBridge';
import { farmChatHotPayloadForFarm, mergeFarmChatHotIncoming } from './farmChatHotSync';
import { listFarmChat, notifyFarmChatChanged } from './farmChatLog';

registerFarmChatHotBridge({
  list: listFarmChat,
  payload: farmChatHotPayloadForFarm,
  merge: mergeFarmChatHotIncoming,
  notify: notifyFarmChatChanged,
});

const FarmFeedPage = lazyWithRetry(() =>
  import('./FarmFeedPage').then((m) => ({ default: m.FarmFeedPage }))
);
const FarmFeedDashboardCard = lazyWithRetry(() =>
  import('./FarmFeedDashboardCard').then((m) => ({ default: m.FarmFeedDashboardCard }))
);
const FarmChatLogsCard = lazyWithRetry(() =>
  import('./FarmChatLogsCard').then((m) => ({ default: m.FarmChatLogsCard }))
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
    farmAdminSettings: FarmChatLogsCard,
  },
};

export { FARM_FEED_PRIMARY_PATH } from '../../../shared/farm/farmFeedPackage';
