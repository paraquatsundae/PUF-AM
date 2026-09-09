import express, { type Express, type Request, type Response } from 'express';

import { isAllowedDpirdProxyPath } from '../../shared/weather/dpirdProxyPaths';
import { queryStringFromOriginalUrl } from '../../shared/weather/queryStringFromOriginalUrl';
import { allowedCorsOrigins, isLanClientOrigin } from './constants';
import { refreshForecastCache, refreshObservedCache } from './refreshStation';
import type { WeatherCaller } from './requireWeatherCaller';
import { sanitizeStationCode } from './stationCode';
import type { WeatherDb } from './weatherDb';

export type ByoWeatherDeps = {
  getApiKey: () => string | undefined;
  getDb: () => WeatherDb;
  requireCaller: (req: Request, res: Response) => Promise<WeatherCaller | null>;
  fetchImpl?: typeof fetch;
};

function corsMiddleware(req: Request, res: Response, next: express.NextFunction) {
  const origin = req.headers.origin;
  const allowed =
    typeof origin === 'string' && (allowedCorsOrigins().has(origin) || isLanClientOrigin(origin));

  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  return next();
}

/**
 * Express app the owner deploys. Paths match hosted `/api/weather/*` so the
 * PUF-AM client can point at this base URL later without a second API.
 */
export function createByoWeatherApp(deps: ByoWeatherDeps): Express {
  const app = express();
  const fetchImpl = deps.fetchImpl ?? fetch;

  app.use(corsMiddleware);
  app.use(express.json());

  app.get(['/api/health', '/health'], (_req, res) => {
    res.json({ status: 'ok', service: 'byo-weather' });
  });

  app.get('/api/weather/health', async (req, res) => {
    const caller = await deps.requireCaller(req, res);
    if (!caller) return;
    res.json({
      ok: true,
      service: 'byo-weather',
      secretConfigured: Boolean(deps.getApiKey()),
    });
  });

  app.post('/api/weather/ensure-cache', async (req, res) => {
    const caller = await deps.requireCaller(req, res);
    if (!caller) return;

    const apiKey = deps.getApiKey();
    if (!apiKey) {
      return res.status(503).json({ error: 'DPIRD API key missing on this function' });
    }

    const stationCode = sanitizeStationCode(req.body?.stationCode);
    if (!stationCode) {
      return res.status(400).json({ error: 'stationCode required' });
    }

    try {
      const result = await refreshObservedCache(deps.getDb(), apiKey, stationCode, {
        startDate: typeof req.body?.startDate === 'string' ? req.body.startDate : undefined,
        endDate: typeof req.body?.endDate === 'string' ? req.body.endDate : undefined,
        forceHistoric: Boolean(req.body?.forceHistoric),
      });
      return res.json(result);
    } catch (error) {
      console.error('[byo-weather ensure-cache]', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'ensure-cache failed',
      });
    }
  });

  app.post('/api/weather/ensure-forecast', async (req, res) => {
    const caller = await deps.requireCaller(req, res);
    if (!caller) return;

    const stationCode = sanitizeStationCode(req.body?.stationCode);
    if (!stationCode) {
      return res.status(400).json({ error: 'stationCode required' });
    }

    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: 'lat/lng required' });
    }

    try {
      const result = await refreshForecastCache(deps.getDb(), stationCode, lat, lng, {
        force: Boolean(req.body?.force),
      });
      return res.json(result);
    } catch (error) {
      console.error('[byo-weather ensure-forecast]', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'ensure-forecast failed',
      });
    }
  });

  app.get('/api/weather/dpird/*', async (req, res) => {
    const dpirdPath = String((req.params as { 0?: string })[0] || '');
    if (!isAllowedDpirdProxyPath(dpirdPath)) {
      return res.status(404).json({ error: 'Unknown DPIRD path' });
    }

    const caller = await deps.requireCaller(req, res);
    if (!caller) return;

    const apiKey = deps.getApiKey();
    if (!apiKey) {
      return res.status(503).json({ error: 'DPIRD API key missing on this function' });
    }

    const qs = queryStringFromOriginalUrl(req.originalUrl);
    const targetUrl = `https://api.agric.wa.gov.au/v2/weather/${dpirdPath}${qs ? `?${qs}` : ''}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000);

    try {
      const response = await fetchImpl(targetUrl, {
        headers: { 'api-key': apiKey, Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return res.status(504).json({ error: 'DPIRD API request timed out' });
      }
      console.error('[byo-weather dpird proxy]', fetchError);
      return res.status(500).json({ error: 'Failed to fetch from DPIRD API' });
    }
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found' });
  });

  return app;
}
