/**
 * Chill portions crop pack — UI registration.
 *
 * Page stays in `src/pages/WeatherEvents`; calculator + science panels live
 * under `src/components/chill/`.
 */
import { IconSnowflake } from '@tabler/icons-react';
import type { CropPackUiRegistration } from '../types';
import {
  CHILL_PORTIONS_PACK_ID,
  CHILL_PORTIONS_PRIMARY_PATH,
} from '../../../shared/farm/chillPortionsPackage';
import { lazyWithRetry } from '../../lib/lazyWithRetry';

const WeatherEventsPage = lazyWithRetry(() =>
  import('../../pages/WeatherEvents').then((m) => ({ default: m.WeatherEvents }))
);

const ChillCalculatorPanel = lazyWithRetry(() =>
  import('../../components/chill/ChillCalculatorPanel').then((m) => ({
    default: m.ChillCalculatorPanel,
  }))
);
const ChillEngineSciencePanel = lazyWithRetry(() =>
  import('../../components/chill/ChillEngineScience').then((m) => ({
    default: m.ChillEngineSciencePanel,
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
  },
};

export { CHILL_PORTIONS_PRIMARY_PATH } from '../../../shared/farm/chillPortionsPackage';
