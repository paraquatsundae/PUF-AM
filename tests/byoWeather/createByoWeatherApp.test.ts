import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';

import { createByoWeatherApp } from '../../functions-byo-weather/src/createByoWeatherApp';
import { DPIRD_PROXY_PATHS } from '../../shared/weather/dpirdProxyPaths';
import { memoryWeatherDb } from './memoryDb';

const REFUSED = [401, 503];

async function listen(app: ReturnType<typeof createByoWeatherApp>) {
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('Failed to bind test server');
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

function close(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

describe('BYO weather HTTP', () => {
  const { db } = memoryWeatherDb();
  let apiKey: string | undefined = 'test-key';
  const requireCaller = vi.fn();

  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createByoWeatherApp({
      getApiKey: () => apiKey,
      getDb: () => db,
      requireCaller,
    });
    ({ server, baseUrl } = await listen(app));
  });

  afterAll(() => close(server));

  it('answers a public health check without spending the key', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', service: 'byo-weather' });
    expect(requireCaller).not.toHaveBeenCalled();
  });

  it('refuses an anonymous caller on cache writers and the DPIRD allow-list', async () => {
    requireCaller.mockImplementation(async (_req, res) => {
      res.status(401).json({ error: 'Missing Authorization bearer token' });
      return null;
    });

    for (const path of ['/api/weather/ensure-cache', '/api/weather/ensure-forecast']) {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationCode: 'MA002', lat: -34.24, lng: 116.14 }),
      });
      expect(REFUSED, `${path} answered ${res.status}`).toContain(res.status);
    }

    const stations = await fetch(`${baseUrl}/api/weather/dpird/stations?limit=5`);
    expect(REFUSED).toContain(stations.status);
  });

  it('does not forward DPIRD paths the app never asks for', async () => {
    requireCaller.mockClear();
    for (const path of [
      '/api/weather/dpird/stations/nearby',
      '/api/weather/dpird/soil/probes',
      '/api/weather/dpird/',
    ]) {
      const res = await fetch(`${baseUrl}${path}`);
      expect(res.status, `${path} answered ${res.status}`).toBe(404);
      expect(await res.json()).toEqual({ error: 'Unknown DPIRD path' });
    }
    expect(requireCaller).not.toHaveBeenCalled();
  });

  it('keeps the same DPIRD allow-list as hosted Cloud Run', () => {
    expect([...DPIRD_PROXY_PATHS]).toEqual(['stations', 'stations/summaries/hourly']);
  });

  it('fails closed when the secret is missing — no hosted-key fallback', async () => {
    apiKey = undefined;
    requireCaller.mockImplementation(async () => ({ uid: 'member-1', farmId: 'farm-1' }));

    const res = await fetch(`${baseUrl}/api/weather/ensure-cache`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stationCode: 'MA002' }),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'DPIRD API key missing on this function' });
    apiKey = 'test-key';
  });

  it('rejects a junk stationCode before calling DPIRD', async () => {
    requireCaller.mockImplementation(async () => ({ uid: 'member-1', farmId: 'farm-1' }));
    const res = await fetch(`${baseUrl}/api/weather/ensure-cache`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stationCode: '../weather_cache/x' }),
    });
    expect(res.status).toBe(400);
  });

  it('reflects the hosted app origin on CORS and omits unknown origins', async () => {
    const allowed = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'https://am.pufworks.farm' },
    });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://am.pufworks.farm');

    const blocked = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'https://evil.example' },
    });
    expect(blocked.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('forwards only an allow-listed hourly path after membership', async () => {
    requireCaller.mockImplementation(async () => ({ uid: 'member-1', farmId: 'farm-1' }));
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ collection: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const isolated = createByoWeatherApp({
      getApiKey: () => 'test-key',
      getDb: () => db,
      requireCaller,
      fetchImpl,
    });
    const { server: inner, baseUrl: innerUrl } = await listen(isolated);
    try {
      const res = await fetch(
        `${innerUrl}/api/weather/dpird/stations/summaries/hourly?stationCode=MA002&limit=100&limit=100`
      );
      expect(res.status).toBe(200);
      expect(fetchImpl).toHaveBeenCalledOnce();
      const url = String(fetchImpl.mock.calls[0]?.[0]);
      expect(url).toContain('https://api.agric.wa.gov.au/v2/weather/stations/summaries/hourly');
      expect(url).toContain('stationCode=MA002');
      expect(url).toContain('limit=100&limit=100');
      const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>;
      expect(headers['api-key']).toBe('test-key');
    } finally {
      await close(inner);
    }
  });
});
