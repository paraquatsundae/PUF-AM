import { IconDroplets } from '@tabler/icons-react';
import type { CropPackUiRegistration } from '../../../src/packs/types';
import { WATER_PACK_ID, WATER_PRIMARY_PATH } from '../../../shared/farm/waterPackage';
import { lazyWithRetry } from '../../../src/lib/lazyWithRetry';

const WaterPage = lazyWithRetry(() =>
  import('./WaterMonitoring').then((m) => ({ default: m.WaterMonitoring }))
);

const WaterAllocationPanel = lazyWithRetry(() =>
  import('./WaterAllocationPanel').then((m) => ({
    default: m.WaterAllocationPanel,
  }))
);

export const packUi: CropPackUiRegistration = {
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
