import type { Express } from 'express';
import { registerAccessPinFarmRoutes } from './accessPinFarmRoutes.ts';
import { registerAccessPinMemberRoutes } from './accessPinMemberRoutes.ts';
import { registerFarmMemberRoutes } from './farmMemberRoutes.ts';

export function registerAccessPinRoutes(app: Express) {
  registerAccessPinFarmRoutes(app);
  registerAccessPinMemberRoutes(app);
  registerFarmMemberRoutes(app);
}
