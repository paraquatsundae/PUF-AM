/**
 * Walnut blight crop pack — UI registration (CP-04).
 *
 * Do not copy this one as a template. It is the largest pack.
 * `Plans/PLUGIN_AUTHORING.md` points new packs at chill portions or water instead.
 */
import { IconBug } from '@tabler/icons-react';
import type { CropPackUiRegistration } from '../../../src/packs/types';
import { WALNUT_BLIGHT_PACK_ID, WALNUT_BLIGHT_PRIMARY_PATH } from '../../../shared/farm/walnutBlightPackage';
import { lazyWithRetry } from '../../../src/lib/lazyWithRetry';

const BlightRiskPage = lazyWithRetry(() =>
  import('./BlightRisk').then((m) => ({ default: m.BlightRisk }))
);

const BlightProductionSettingsPanel = lazyWithRetry(() =>
  import('./BlightProductionSettingsPanel').then((m) => ({
    default: m.BlightProductionSettingsPanel,
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

export const packUi: CropPackUiRegistration = {
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
    productionSettings: BlightProductionSettingsPanel,
    researchSettings: BlightResearchModifiersPanel,
    science: BlightEngineSciencePanel,
    engineSettings: BlightEngineSettings,
    dashboardCard: BlightDashboardCard,
  },
};

export { WALNUT_BLIGHT_PRIMARY_PATH } from '../../../shared/farm/walnutBlightPackage';
