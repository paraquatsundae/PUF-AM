import { IconTemperature } from '@tabler/icons-react';
import type { CropPackUiRegistration } from '../../../src/packs/types';
import { DRYING_PACK_ID, DRYING_PRIMARY_PATH } from '../../../shared/farm/dryingPackage';
import { lazyWithRetry } from '../../../src/lib/lazyWithRetry';

// Cross-pack: drying reuses harvest's dryer panel (PLUGIN_PACK_LAYOUT.md §7 q4).
const FarmDryersPanel = lazyWithRetry(() =>
  import('../../harvest/src/FarmDryersPanel').then((m) => ({
    default: m.FarmDryersPanel,
  }))
);

const DryingPage = lazyWithRetry(() =>
  import('./Drying').then((m) => ({ default: m.Drying }))
);

export const packUi: CropPackUiRegistration = {
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
