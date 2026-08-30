import { useEffect, useMemo, useState } from 'react';
import { SEASONS, WALNUT_DISTRICTS } from '../constants';
import type { WeatherData } from '../lib/blightModel';
import {
  calculateDistance,
  fetchAllDPIRDStations,
  fetchEnvironmentalData,
  type WeatherSource,
} from '../lib/weatherService';

export function useBlightWeather({
  farmId,
  activeTab,
  viewport,
}: {
  farmId: string | undefined;
  activeTab: 'forecast' | 'historical' | 'sandbox';
  viewport: { lat: number; lng: number };
}) {
  const [dpirdStations, setDpirdStations] = useState<any[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isFetchingStations, setIsFetchingStations] = useState(false);
  const [weatherSource, setWeatherSource] = useState<WeatherSource>('DPIRD');
  const [locationId, setLocationId] = useState('manjimup');
  const [weatherData, setWeatherData] = useState<Record<string, WeatherData>>({});
  const [forecastWeather, setForecastWeather] = useState<Record<string, WeatherData>>({});
  const [forecastUpdatedAt, setForecastUpdatedAt] = useState<string | undefined>(undefined);
  const [weatherMeta, setWeatherMeta] = useState<{
    lastUpdated?: string;
    isStale?: boolean;
    cacheSource?: string;
  } | null>(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const initLocations = async () => {
      setIsFetchingStations(true);
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (isMounted) {
              setUserLocation({
                lat: position.coords.latitude,
                lng: position.coords.longitude,
              });
            }
          },
          (error) => {
            console.warn('Geolocation access denied or failed:', error);
          }
        );
      }
      try {
        const stations = await fetchAllDPIRDStations();
        if (isMounted && stations.length > 0) {
          setDpirdStations(stations);
        }
      } catch (error) {
        console.error('Failed to fetch DPIRD stations:', error);
      } finally {
        if (isMounted) setIsFetchingStations(false);
      }
    };
    void initLocations();
    return () => {
      isMounted = false;
    };
  }, []);

  const processedStations = useMemo(() => {
    if (!dpirdStations || dpirdStations.length === 0) return [];
    const farmLat = viewport.lat;
    const farmLng = viewport.lng;
    const stationsWithDistances = dpirdStations.map((station) => {
      const distToFarm = calculateDistance(farmLat, farmLng, station.latitude, station.longitude);
      const distToUser = userLocation
        ? calculateDistance(userLocation.lat, userLocation.lng, station.latitude, station.longitude)
        : Infinity;
      return { ...station, distToFarm, distToUser };
    });
    const filteredStations = stationsWithDistances.filter(
      (s) => s.distToFarm <= 50 || s.distToUser <= 50
    );
    if (filteredStations.length === 0) {
      const closestToFarm = [...stationsWithDistances].sort((a, b) => a.distToFarm - b.distToFarm)[0];
      return closestToFarm ? [closestToFarm] : [];
    }
    const minFarmDist = Math.min(...filteredStations.map((s) => s.distToFarm));
    return [...filteredStations].sort((a, b) => {
      if (a.distToFarm === minFarmDist && b.distToFarm !== minFarmDist) return -1;
      if (b.distToFarm === minFarmDist && a.distToFarm !== minFarmDist) return 1;
      return a.distToUser - b.distToUser;
    });
  }, [dpirdStations, viewport, userLocation]);

  useEffect(() => {
    if (weatherSource === 'DPIRD') {
      if (processedStations.length > 0) {
        const bestStation = processedStations[0].stationCode || processedStations[0].code;
        if (
          locationId === 'manjimup' ||
          !processedStations.find((s) => (s.stationCode || s.code) === locationId)
        ) {
          setLocationId(bestStation);
        }
      }
    } else if (!WALNUT_DISTRICTS.find((d) => d.id === locationId)) {
      setLocationId('manjimup');
    }
  }, [processedStations, weatherSource, locationId]);

  useEffect(() => {
    if (!farmId) return;
    if (weatherSource === 'DPIRD' && isFetchingStations) return;

    let isMounted = true;
    const loadWeather = async () => {
      setIsLoadingWeather(true);
      try {
        const seasonKey = activeTab === 'forecast' ? SEASONS[0] : SEASONS[SEASONS.length - 1];
        const startYear = parseInt(seasonKey.split('-')[0], 10);
        const startDate = new Date(`${startYear}-06-01T12:00:00Z`);
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);

        let lat = -34.24;
        let lng = 116.14;
        let actualStationCode: string | undefined;

        if (weatherSource === 'DPIRD') {
          const station = processedStations.find((s) => (s.stationCode || s.code) === locationId);
          if (station) {
            lat = station.latitude;
            lng = station.longitude;
            actualStationCode = station.stationCode || station.code;
          } else if (processedStations.length > 0) {
            lat = processedStations[0].latitude;
            lng = processedStations[0].longitude;
            actualStationCode = processedStations[0].stationCode || processedStations[0].code;
          }
        } else {
          const district = WALNUT_DISTRICTS.find((d) => d.id === locationId);
          if (district) {
            lat = district.lat;
            lng = district.lng;
          }
        }

        const result = await fetchEnvironmentalData(
          farmId || '',
          weatherSource,
          startDate,
          endDate,
          lat,
          lng,
          actualStationCode
        );

        if (isMounted) {
          const keys = Object.keys(result.weatherData || {});
          if (keys.length === 0 && weatherSource === 'DPIRD') {
            console.warn('[Blight] DPIRD weather empty; switching to Manual / Fallback');
            setWeatherSource('Manual');
            return;
          }
          setWeatherData(result.weatherData);
          setForecastWeather(result.forecastData || {});
          setForecastUpdatedAt(result.forecastUpdatedAt);
          setWeatherMeta({
            lastUpdated: result.lastUpdated,
            isStale: result.isStale,
            cacheSource: result.cacheSource,
          });
          if (result.cacheSource) {
            console.log(
              `[Blight] Weather loaded: ${keys.length} days via ${result.cacheSource}` +
                (result.isStale ? ' (stale)' : '')
            );
          }
        }
      } catch (error) {
        console.error('Failed to fetch weather data:', error);
        if (isMounted && weatherSource === 'DPIRD') {
          setWeatherSource('Manual');
          return;
        }
      } finally {
        if (isMounted) setIsLoadingWeather(false);
      }
    };

    void loadWeather();
    return () => {
      isMounted = false;
    };
  }, [weatherSource, locationId, processedStations, farmId, isFetchingStations, activeTab]);

  return {
    weatherSource,
    setWeatherSource,
    locationId,
    setLocationId,
    weatherData,
    forecastWeather,
    forecastUpdatedAt,
    weatherMeta,
    isLoadingWeather,
    isFetchingStations,
    processedStations,
  };
}
