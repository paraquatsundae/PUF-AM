/**
 * Chill portions crop pack — UI registration.
 *
 * The Dynamic Model itself is not in this folder. It stays in `shared/weather/`
 * because `server/chillRoutes.ts` computes seasonal portions from hourly DPIRD
 * data, and the server cannot import from a pack. The UI reaches that route
 * through `apiUrl` — server-only `DPIRD_API_KEY`, never `VITE_DPIRD_API_KEY`.
 */
import { IconSnowflake } from '@tabler/icons-react';
import type { CropPackUiRegistration } from '../../../src/packs/types';
import {
  CHILL_PORTIONS_PACK_ID,
  CHILL_PORTIONS_PRIMARY_PATH,
} from '../../../shared/farm/chillPortionsPackage';
import { lazyWithRetry } from '../../../src/lib/lazyWithRetry';
import { CHILL_VARIETY_REQUIREMENTS, chillRequirementLabel } from './chillCrops';

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

export const packUi: CropPackUiRegistration = {
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
      section: 'scout',
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
  // Varieties with a published portion requirement. The note is that figure
  // (a single target, or the standalone calculator's band). Names with no
  // figure stay out of the picker — the block readout says the requirement
  // is not set instead of inventing one.
  blockCultivars: CHILL_VARIETY_REQUIREMENTS.flatMap((variety) => {
    const note = chillRequirementLabel(variety);
    if (note == null) return [];
    return [{ id: variety.id, name: variety.name, note }];
  }),
};

export { CHILL_PORTIONS_PRIMARY_PATH } from '../../../shared/farm/chillPortionsPackage';
