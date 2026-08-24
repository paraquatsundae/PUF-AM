import React from 'react';
import { IconTemperature } from '@tabler/icons-react';
import { FarmDryersPanel } from '../../components/harvest/FarmDryersPanel';
import type { CropPackUiRegistration } from '../types';
import { DRYING_PACK_ID, DRYING_PRIMARY_PATH } from '../../../shared/farm/dryingPackage';

const DryingPage = React.lazy(() =>
  import('../../pages/Drying').then((m) => ({ default: m.Drying }))
);

export const dryingPackUi: CropPackUiRegistration = {
  packId: DRYING_PACK_ID,
  routes: [
    {
      path: DRYING_PRIMARY_PATH.replace(/^\//, ''),
      moduleId: 'drying',
      Page: DryingPage,
    },
  ],
  navItems: [
    {
      groupId: 'crop',
      name: 'Drying',
      href: DRYING_PRIMARY_PATH,
      icon: IconTemperature,
      moduleId: 'drying',
    },
  ],
  surfaces: {
    productionSettings: FarmDryersPanel,
  },
};

export { DRYING_PRIMARY_PATH } from '../../../shared/farm/dryingPackage';
