import React from 'react';
import { IconDroplets } from '@tabler/icons-react';
import { WaterAllocationPanel } from '../../components/water/WaterAllocationPanel';
import type { CropPackUiRegistration } from '../types';
import { WATER_PACK_ID, WATER_PRIMARY_PATH } from '../../../shared/farm/waterPackage';

const WaterPage = React.lazy(() =>
  import('../../pages/WaterMonitoring').then((m) => ({ default: m.WaterMonitoring }))
);

export const waterPackUi: CropPackUiRegistration = {
  packId: WATER_PACK_ID,
  routes: [
    {
      path: WATER_PRIMARY_PATH.replace(/^\//, ''),
      moduleId: 'water',
      Page: WaterPage,
    },
  ],
  navItems: [
    {
      groupId: 'crop',
      name: 'Water',
      href: WATER_PRIMARY_PATH,
      icon: IconDroplets,
      moduleId: 'water',
    },
  ],
  surfaces: {
    productionSettings: WaterAllocationPanel,
  },
};

export { WATER_PRIMARY_PATH } from '../../../shared/farm/waterPackage';
