import { IconChartLine } from '@tabler/icons-react';
import type { CropPackUiRegistration } from '../../../src/packs/types';
import { lazyWithRetry } from '../../../src/lib/lazyWithRetry';
import {
  TIMESERIES_DEMO_PACK_ID,
  TIMESERIES_DEMO_PRIMARY_PATH,
} from '../../../shared/farm/timeseriesDemoPackage';

const TimeSeriesDemoPage = lazyWithRetry(() =>
  import('./TimeSeriesDemo').then((module) => ({ default: module.TimeSeriesDemo }))
);

export const packUi: CropPackUiRegistration = {
  packId: TIMESERIES_DEMO_PACK_ID,
  routes: [
    {
      path: TIMESERIES_DEMO_PRIMARY_PATH.replace(/^\//, ''),
      moduleId: 'timeseries_demo',
      Page: TimeSeriesDemoPage,
    },
  ],
  navItems: [
    {
      groupId: 'crop',
      name: 'Dendrometer demo',
      href: TIMESERIES_DEMO_PRIMARY_PATH,
      icon: IconChartLine,
      moduleId: 'timeseries_demo',
    },
  ],
  surfaces: {},
};

export { TIMESERIES_DEMO_PRIMARY_PATH } from '../../../shared/farm/timeseriesDemoPackage';
