/**
 * Freenet network pack — UI registration (Plans/NETWORK_PACK_PLUGIN.md § index.ts).
 *
 * Experimental — not production. Firebase Auth + invite PIN is the shipping path.
 *
 * Everything the app shows about Freenet is registered here and rendered by
 * core through `src/packs/registry.ts` surfaces; no core file imports this
 * folder by name. The crypto, slot contract and node lifecycle live in
 * `units/`; the mist client under `src/mist/` moves with slice B.
 *
 * Eager vs lazy: the session gate must be eager (a lazy gate flashes the app it
 * holds back) and the "How it works" button is small and sits on first-paint
 * cards. Everything else loads on demand.
 */
import type { NetworkPackUiRegistration } from '../../../src/packs/types';
import { FREENET_HOST_PACK_ID } from '../../../shared/farm/freenetHostPackage';
import { lazyWithRetry } from '../../../src/lib/lazyWithRetry';
import { MistJoinTicketGate } from './MistJoinTicketGate';
import { FreenetHowItWorksButton } from './FreenetHowItWorks';
import { MIST_NEW_FARM_PATH, MIST_RECOVER_FARM_PATH } from './paths.ts';

const MistNewFarmPage = lazyWithRetry(() =>
  import('./MistNewFarm').then((m) => ({ default: m.MistNewFarm }))
);
const MistRecoverFarmPage = lazyWithRetry(() =>
  import('./MistRecoverFarm').then((m) => ({ default: m.MistRecoverFarm }))
);
const FreenetFarmSession = lazyWithRetry(() => import('./FreenetFarmSession'));
const MistFarmSyncCard = lazyWithRetry(() =>
  import('./MistFarmSyncCard').then((m) => ({ default: m.MistFarmSyncCard }))
);
const MistWorkshopCard = lazyWithRetry(() =>
  import('./MistWorkshopCard').then((m) => ({ default: m.MistWorkshopCard }))
);
const FreenetExplainLoginStep = lazyWithRetry(() => import('./FreenetExplain'));
const FreenetLoginJoinStep = lazyWithRetry(() => import('./FreenetLoginJoin'));
const FreenetHybridJoinPrompt = lazyWithRetry(() => import('./FreenetHybridJoinPrompt'));
const FreenetSendNudge = lazyWithRetry(() =>
  import('./FreenetSendNudge').then((m) => ({ default: m.FreenetSendNudge }))
);
const FreenetPluginTile = lazyWithRetry(() => import('./FreenetPluginTile'));

export const packUi: NetworkPackUiRegistration = {
  packId: FREENET_HOST_PACK_ID,
  // No module routes and no nav item: a network pack has no page of its own.
  routes: [],
  navItems: [],
  publicRoutes: [
    { path: MIST_NEW_FARM_PATH, Page: MistNewFarmPage },
    { path: MIST_RECOVER_FARM_PATH, Page: MistRecoverFarmPage },
  ],
  surfaces: {
    farmSession: FreenetFarmSession,
    sessionGate: MistJoinTicketGate,
    syncCard: MistFarmSyncCard,
    workshopDiagnostics: MistWorkshopCard,
    loginExplain: FreenetExplainLoginStep,
    loginJoin: FreenetLoginJoinStep,
    farmSetupNudge: FreenetSendNudge,
    howItWorks: FreenetHowItWorksButton,
    pluginTile: FreenetPluginTile,
    postSignInPrompt: FreenetHybridJoinPrompt,
  },
};
