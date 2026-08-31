import { IconTractor } from '@tabler/icons-react';
import type { CropPackUiRegistration } from '../types';
import { HARVEST_PACK_ID, HARVEST_PRIMARY_PATH } from '../../../shared/farm/harvestPackage';
import { lazyWithRetry } from '../../lib/lazyWithRetry';

const HarvestPage = lazyWithRetry(() =>
  import('../../pages/Harvest').then((m) => ({ default: m.Harvest }))
);

export const harvestPackUi: CropPackUiRegistration = {
  packId: HARVEST_PACK_ID,
  routes: [
    {
      path: HARVEST_PRIMARY_PATH.replace(/^\//, ''),
      moduleId: 'harvest',
      Page: HarvestPage,
    },
  ],
  navItems: [
    {
      groupId: 'records',
      name: 'Harvest',
      href: HARVEST_PRIMARY_PATH,
      icon: IconTractor,
      moduleId: 'harvest',
    },
  ],
  surfaces: {},
};

export { HARVEST_PRIMARY_PATH } from '../../../shared/farm/harvestPackage';
