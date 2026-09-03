import { IconFlask2 } from '@tabler/icons-react';
import type { CropPackUiRegistration } from '../../../src/packs/types';
import { NUTRITION_PACK_ID, NUTRITION_PRIMARY_PATH } from '../../../shared/farm/nutritionPackage';
import { lazyWithRetry } from '../../../src/lib/lazyWithRetry';

const NutritionPage = lazyWithRetry(() =>
  import('./Nutrition').then((m) => ({ default: m.Nutrition }))
);

export const packUi: CropPackUiRegistration = {
  packId: NUTRITION_PACK_ID,
  routes: [
    {
      path: NUTRITION_PRIMARY_PATH.replace(/^\//, ''),
      moduleId: 'nutrition',
      Page: NutritionPage,
    },
  ],
  navItems: [
    {
      groupId: 'crop',
      name: 'Nutrition',
      href: NUTRITION_PRIMARY_PATH,
      icon: IconFlask2,
      moduleId: 'nutrition',
    },
  ],
  surfaces: {},
};

export { NUTRITION_PRIMARY_PATH } from '../../../shared/farm/nutritionPackage';
