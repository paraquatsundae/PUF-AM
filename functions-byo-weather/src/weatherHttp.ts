import { onRequest } from 'firebase-functions/v2/https';

import { BYO_WEATHER_REGION } from './constants';
import { createByoWeatherApp } from './createByoWeatherApp';
import { getWeatherDb } from './db';
import { createRequireWeatherCaller, productionWeatherCallerDeps } from './requireWeatherCaller';
import { dpirdApiKey } from './secrets';

const requireCaller = createRequireWeatherCaller(productionWeatherCallerDeps());

const app = createByoWeatherApp({
  getApiKey: () => dpirdApiKey.value() || undefined,
  getDb: getWeatherDb,
  requireCaller,
});

/** HTTP base the owner pastes into PUF-AM. Paths are `/api/weather/*`. */
export const byoWeatherApi = onRequest(
  {
    region: BYO_WEATHER_REGION,
    secrets: [dpirdApiKey],
    cors: false,
    timeoutSeconds: 540,
    memory: '512MiB',
    invoker: 'public',
  },
  app
);
