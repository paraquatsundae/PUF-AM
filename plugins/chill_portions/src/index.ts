/**
 * Chill portions crop pack — UI registration.
 *
 * Page stays in `src/pages/WeatherEvents`; calculator + science panels live
 * under `src/components/chill/`.
 */
import { IconSnowflake } from '@tabler/icons-react';
import type { CropPackUiRegistration } from '../../../src/packs/types';
import {
  CHILL_PORTIONS_PACK_ID,
  CHILL_PORTIONS_PRIMARY_PATH,
} from '../../../shared/farm/chillPortionsPackage';
import { CULTIVARS } from '../../../shared/weather/chillPortions';
import { lazyWithRetry } from '../../../src/lib/lazyWithRetry';

const WeatherEventsPage = lazyWithRetry(() =>
  import('./WeatherEvents').then((m) => ({ default: m.WeatherEvents }))
);

const ChillCalculatorPanel = lazyWithRetry(() =>
  import('./ChillCalculatorPanel').then((m) => ({
    default: m.ChillCalculatorPanel,
  }))
);
const ChillEngineSciencePanel = lazyWithRetry(() =>
  import('./ChillEngineScience').then((m) => ({
    default: m.ChillEngineSciencePanel,
  }))
);
const ChillDashboardCard = lazyWithRetry(() =>
  import('./ChillDashboardCard').then((m) => ({
    default: m.ChillDashboardCard,
  }))
);
const ChillBlockReadout = lazyWithRetry(() =>
  import('./ChillBlockReadout').then((m) => ({
    default: m.ChillBlockReadout,
  }))
);

const chillPath = CHILL_PORTIONS_PRIMARY_PATH.replace(/^\//, '');

export const chillPortionsPackUi: CropPackUiRegistration = {
  packId: CHILL_PORTIONS_PACK_ID,
  routes: [
    {
      path: chillPath,
      moduleId: 'chill',
      Page: WeatherEventsPage,
    },
  ],
  navItems: [
    {
      groupId: 'crop',
      name: 'Chill portions',
      href: CHILL_PORTIONS_PRIMARY_PATH,
      icon: IconSnowflake,
      moduleId: 'chill',
    },
  ],
  surfaces: {
    productionSettings: ChillCalculatorPanel,
    science: ChillEngineSciencePanel,
    dashboardCard: ChillDashboardCard,
    blockOperateReadout: ChillBlockReadout,
  },
  // Cited targets from the pack's engine.json — the chill requirement is the
  // reason to pick one cultivar over another, so it rides along as the note.
  blockCultivars: CULTIVARS.map((c) => ({
    id: c.id,
    name: c.name,
    note: `${c.requiredCP} CP`,
  })),
};

export { CHILL_PORTIONS_PRIMARY_PATH } from '../../../shared/farm/chillPortionsPackage';
