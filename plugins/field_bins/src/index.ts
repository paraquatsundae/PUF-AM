import { IconBuildingWarehouse } from '@tabler/icons-react';
import type { CropPackUiRegistration } from '../../../src/packs/types';
import { FIELD_BINS_PACK_ID, FIELD_BINS_PRIMARY_PATH } from '../../../shared/farm/fieldBinsPackage';
import { lazyWithRetry } from '../../../src/lib/lazyWithRetry';

const FieldBinsPage = lazyWithRetry(() =>
  import('./FieldBins').then((m) => ({ default: m.FieldBins }))
);

const FieldBinPinMetadataExtra = lazyWithRetry(() =>
  import('./FieldBinPinMetadataExtra').then((m) => ({
    default: m.FieldBinPinMetadataExtra,
  }))
);

export const packUi: CropPackUiRegistration = {
  packId: FIELD_BINS_PACK_ID,
  routes: [
    {
      path: FIELD_BINS_PRIMARY_PATH.replace(/^\//, ''),
      moduleId: 'field_bins',
      Page: FieldBinsPage,
    },
  ],
  navItems: [
    {
      groupId: 'field',
      name: 'Field bins',
      href: FIELD_BINS_PRIMARY_PATH,
      icon: IconBuildingWarehouse,
      moduleId: 'field_bins',
    },
  ],
  surfaces: {
    pinMetadataExtra: FieldBinPinMetadataExtra,
  },
};

export { FIELD_BINS_PRIMARY_PATH } from '../../../shared/farm/fieldBinsPackage';
