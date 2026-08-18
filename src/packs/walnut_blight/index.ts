/**
 * Walnut blight crop pack — UI registration (CP-04).
 *
 * Page + panels stay in `src/pages/BlightRisk` and `src/components/blight/`
 * for now; this module is the seam new packs should copy.
 */
import React from 'react';
import { IconBug } from '@tabler/icons-react';
import { BlightOrchardInoculumPanel } from '../../components/blight/BlightOrchardInoculumPanel';
import { BlightResearchModifiersPanel } from '../../components/blight/BlightResearchModifiersPanel';
import { BlightEngineSciencePanel } from '../../components/blight/BlightEngineScience';
import { BlightEngineSettings } from '../../components/blight/BlightEngineSettings';
import type { CropPackUiRegistration } from '../types';
import { WALNUT_BLIGHT_PACK_ID, WALNUT_BLIGHT_PRIMARY_PATH } from '../../../shared/farm/walnutBlightPackage';

const BlightRiskPage = React.lazy(() =>
  import('../../pages/BlightRisk').then((m) => ({ default: m.BlightRisk }))
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
  },
};

export { WALNUT_BLIGHT_PRIMARY_PATH } from '../../../shared/farm/walnutBlightPackage';
