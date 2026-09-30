import type { Express } from 'express';
import { registerAccessPinFarmRoutes } from './accessPinFarmRoutes.ts';
import { registerAccessPinLimitRoutes } from './accessPinLimitRoutes.ts';
import { registerAccessPinMemberRoutes } from './accessPinMemberRoutes.ts';
import { registerDirectedNotifyRoutes } from './directedNotifyRoutes.ts';
import { registerFarmMemberRoutes } from './farmMemberRoutes.ts';

export function registerAccessPinRoutes(app: Express) {
  registerAccessPinFarmRoutes(app);
  registerAccessPinMemberRoutes(app);
  registerAccessPinLimitRoutes(app);
  registerFarmMemberRoutes(app);
  registerDirectedNotifyRoutes(app);
}
