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

const BlightRiskPage = React.lazy(() =>
  import('../../pages/BlightRisk').then((m) => ({ default: m.BlightRisk }))
);

export const walnutBlightPackUi: CropPackUiRegistration = {
  packId: 'walnut_blight',
  routes: [
    {
      path: 'blight',
      moduleId: 'blight',
      Page: BlightRiskPage,
    },
  ],
  navItems: [
    {
      groupId: 'crop',
      name: 'Blight Risk',
      href: '/blight',
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

/** Stable primary path for links (About, Dashboard, Crop packs card). */
export const WALNUT_BLIGHT_PRIMARY_PATH = '/blight';
