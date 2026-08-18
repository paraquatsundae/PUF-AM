/**
 * Chill portions crop pack — UI registration.
 *
 * Page stays in `src/pages/WeatherEvents`; calculator + science panels live
 * under `src/components/chill/`.
 */
import React from 'react';
import { IconSnowflake } from '@tabler/icons-react';
import { ChillEngineSciencePanel } from '../../components/chill/ChillEngineScience';
import { ChillCalculatorPanel } from '../../components/chill/ChillCalculatorPanel';
import type { CropPackUiRegistration } from '../types';
import {
  CHILL_PORTIONS_PACK_ID,
  CHILL_PORTIONS_PRIMARY_PATH,
} from '../../../shared/farm/chillPortionsPackage';

const WeatherEventsPage = React.lazy(() =>
  import('../../pages/WeatherEvents').then((m) => ({ default: m.WeatherEvents }))
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
