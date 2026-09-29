import { IconWheat } from '@tabler/icons-react';
import type { CropPackUiRegistration } from '../../../src/packs/types';
import { WHEAT_YIELD_PACK_ID, WHEAT_YIELD_PRIMARY_PATH } from '../../../shared/farm/wheatYieldPackage';
import { lazyWithRetry } from '../../../src/lib/lazyWithRetry';

const WheatYieldPage = lazyWithRetry(() =>
  import('./WheatYield').then((m) => ({ default: m.WheatYield }))
);
const WheatYieldScience = lazyWithRetry(() =>
  import('./WheatYieldScience').then((m) => ({ default: m.WheatYieldScience }))
);
const WheatBlockReadout = lazyWithRetry(() =>
  import('./WheatBlockReadout').then((m) => ({ default: m.WheatBlockReadout }))
);

export const packUi: CropPackUiRegistration = {
  packId: WHEAT_YIELD_PACK_ID,
  routes: [
    {
      path: WHEAT_YIELD_PRIMARY_PATH.replace(/^\//, ''),
      moduleId: 'wheat',
      Page: WheatYieldPage,
    },
  ],
  navItems: [
    {
      groupId: 'crop',
      name: 'Wheat yield',
      href: WHEAT_YIELD_PRIMARY_PATH,
      icon: IconWheat,
      moduleId: 'wheat',
    },
  ],
  surfaces: {
    science: WheatYieldScience,
    blockOperateReadout: WheatBlockReadout,
  },
  blockCultivars: [{ id: 'wheat', name: 'Wheat' }],
};

export { WHEAT_YIELD_PRIMARY_PATH } from '../../../shared/farm/wheatYieldPackage';
