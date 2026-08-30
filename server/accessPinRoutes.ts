import type { Express } from 'express';
import { registerAccessPinFarmRoutes } from './accessPinFarmRoutes.ts';
import { registerAccessPinMemberRoutes } from './accessPinMemberRoutes.ts';

export function registerAccessPinRoutes(app: Express) {
  registerAccessPinFarmRoutes(app);
  registerAccessPinMemberRoutes(app);
}
