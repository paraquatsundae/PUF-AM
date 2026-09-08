import { describe, expect, it } from 'vitest';

import { WEATHER_STATION_ANCHORS } from '../../shared/weather/dpirdClient';
import { discoverRefreshStations } from '../../functions-byo-weather/src/discoverStations';
import { memoryWeatherDb } from './memoryDb';

describe('discoverRefreshStations', () => {
  it('falls back to the four SW anchors when the project is empty', async () => {
    const { db } = memoryWeatherDb();
    const stations = await discoverRefreshStations(db);
    expect(stations.map((s) => s.stationCode)).toEqual(
      WEATHER_STATION_ANCHORS.map((s) => s.stationCode)
    );
  });

  it('prefers the farm settings station over the empty-cache fallback', async () => {
    const { db } = memoryWeatherDb();
    await db.doc('farms/farm-1').set({ name: 'Orchard' });
    await db.doc('farms/farm-1/settings/farm').set({
      dpirdStationCode: 'AN001',
      dpirdStationName: 'Allanooka',
    });

    const stations = await discoverRefreshStations(db);
    expect(stations).toEqual([
      { stationCode: 'AN001', stationName: 'Allanooka', lat: undefined, lng: undefined },
    ]);
  });

  it('picks up a station already written to weather_cache', async () => {
    const { db } = memoryWeatherDb();
    await db.doc('weather_cache/PE001').set({
      stationCode: 'PE001',
      stationName: 'Pemberton',
      weatherData: { '2026-01-01': { T: 1 } },
    });

    const stations = await discoverRefreshStations(db);
    expect(stations.some((s) => s.stationCode === 'PE001' && s.lat === -34.44)).toBe(true);
    expect(stations).toHaveLength(1);
  });

  it('ignores junk cache ids so a bad doc cannot aim the hourly job', async () => {
    const { db } = memoryWeatherDb();
    await db.doc('weather_cache/../users').set({ stationCode: 'nope' });
    const stations = await discoverRefreshStations(db);
    expect(stations.map((s) => s.stationCode)).toEqual(
      WEATHER_STATION_ANCHORS.map((s) => s.stationCode)
    );
  });
});
