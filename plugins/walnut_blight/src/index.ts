/**
 * Walnut blight crop pack — UI registration (CP-04).
 *
 * Page + panels stay in `src/pages/BlightRisk` and `src/components/blight/`
 * for now; this module is the seam new packs should copy.
 */
import { IconBug } from '@tabler/icons-react';
import type { CropPackUiRegistration } from '../../../src/packs/types';
import { WALNUT_BLIGHT_PACK_ID, WALNUT_BLIGHT_PRIMARY_PATH } from '../../../shared/farm/walnutBlightPackage';
import { lazyWithRetry } from '../../../src/lib/lazyWithRetry';

const BlightRiskPage = lazyWithRetry(() =>
  import('./BlightRisk').then((m) => ({ default: m.BlightRisk }))
);

const BlightOrchardInoculumPanel = lazyWithRetry(() =>
  import('./BlightOrchardInoculumPanel').then((m) => ({
    default: m.BlightOrchardInoculumPanel,
  }))
);
const BlightResearchModifiersPanel = lazyWithRetry(() =>
  import('./BlightResearchModifiersPanel').then((m) => ({
    default: m.BlightResearchModifiersPanel,
  }))
);
const BlightEngineSciencePanel = lazyWithRetry(() =>
  import('./BlightEngineScience').then((m) => ({
    default: m.BlightEngineSciencePanel,
  }))
);
const BlightEngineSettings = lazyWithRetry(() =>
  import('./BlightEngineSettings').then((m) => ({
    default: m.BlightEngineSettings,
  }))
);
const BlightDashboardCard = lazyWithRetry(() =>
  import('./BlightDashboardCard').then((m) => ({
    default: m.BlightDashboardCard,
  }))
);

const blightPath = WALNUT_BLIGHT_PRIMARY_PATH.replace(/^\//, '');

export const walnutBlightPackUi: CropPackUiRegistration = {
  packId: WALNUT_BLIGHT_PACK_ID,
  routes: [
    {
      path: blightPath,
      moduleId: 'blight',
      Page: BlightRiskPage,
    },
  ],
  navItems: [
    {
      groupId: 'crop',
      name: 'Blight Risk',
      href: WALNUT_BLIGHT_PRIMARY_PATH,
      icon: IconBug,
      moduleId: 'blight',
    },
  ],
  surfaces: {
    productionSettings: BlightOrchardInoculumPanel,
    researchSettings: BlightResearchModifiersPanel,
    science: BlightEngineSciencePanel,
    engineSettings: BlightEngineSettings,
    dashboardCard: BlightDashboardCard,
  },
};

export { WALNUT_BLIGHT_PRIMARY_PATH } from '../../../shared/farm/walnutBlightPackage';
