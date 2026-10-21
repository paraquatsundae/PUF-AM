import { IconRadar } from '@tabler/icons-react';
import type { CropPackUiRegistration } from '../../../src/packs/types';
import { SENSORS_PACK_ID, SENSORS_PRIMARY_PATH } from '../../../shared/farm/sensorsPackage';
import { lazyWithRetry } from '../../../src/lib/lazyWithRetry';

const SensorsPage = lazyWithRetry(() =>
  import('./Sensors').then((m) => ({ default: m.Sensors }))
);

const SensorPinMetadataExtra = lazyWithRetry(() =>
  import('./SensorPinMetadataExtra').then((m) => ({
    default: m.SensorPinMetadataExtra,
  }))
);

export const packUi: CropPackUiRegistration = {
  packId: SENSORS_PACK_ID,
  routes: [
    {
      path: SENSORS_PRIMARY_PATH.replace(/^\//, ''),
      moduleId: 'sensors',
      Page: SensorsPage,
    },
  ],
  navItems: [
    {
      groupId: 'field',
      name: 'Sensors',
      href: SENSORS_PRIMARY_PATH,
      icon: IconRadar,
      moduleId: 'sensors',
    },
  ],
  surfaces: {
    pinMetadataExtra: SensorPinMetadataExtra,
  },
};

export { SENSORS_PRIMARY_PATH } from '../../../shared/farm/sensorsPackage';
