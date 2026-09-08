import { onSchedule } from 'firebase-functions/v2/scheduler';

import { BYO_WEATHER_REGION } from './constants';
import { getWeatherDb } from './db';
import { dpirdApiKey } from './secrets';
import { runWeatherRefresh } from './weatherRefresh';

export const byoRefreshWeatherCache = onSchedule(
  {
    region: BYO_WEATHER_REGION,
    schedule: 'every 60 minutes',
    timeZone: 'Australia/Perth',
    secrets: [dpirdApiKey],
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    await runWeatherRefresh(getWeatherDb(), dpirdApiKey.value());
  }
);
