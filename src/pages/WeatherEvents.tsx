import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, MapPin, Snowflake } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useFarmDiary } from '../lib/farmDiary';
import { useMapStore } from '../lib/mapStore';
import { useFarmChillPortions } from '../hooks/useFarmChillPortions';
import { useWalnutPack } from '../hooks/useWalnutPack';
import { farmShowsChillPortions } from '../../shared/farm/farmTypes';
import {
  WEATHER_STATION_ANCHORS,
  calculateDistance,
  fetchAllDPIRDStations,
} from '../lib/weatherService';
import { cn } from '../lib/utils';

type StationOption = {
  stationCode: string;
  stationName: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
};

/**
 * Working title — rename after workshop.
 * Plain chill portions (last 24h + season to date). Frost/heat later.
 */
export function WeatherEvents() {
  const { userData } = useAuth();
  const canEdit = userData?.role === 'admin' || userData?.role === 'farmer';
  const { settings, updateSettings } = useFarmDiary();
  const { blocks, viewport } = useMapStore();
  const hasWalnutPack = useWalnutPack();
  const showChill = farmShowsChillPortions({
    profile: settings.farmProfile,
    blocks,
    walnutPackActive: hasWalnutPack,
  });

  const preferredCode = settings.dpirdStationCode?.trim() || '';
  const preferredName = settings.dpirdStationName?.trim() || '';

  const chill = useFarmChillPortions(
    viewport.lat,
    viewport.lng,
    showChill,
    preferredCode || undefined,
    preferredName || undefined
  );

  const [stations, setStations] = useState<StationOption[]>([]);
  const [stationsLoading, setStationsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setStationsLoading(true);
      try {
        const raw = await fetchAllDPIRDStations();
        const mapped: StationOption[] = [];
        for (const row of raw) {
          const s = row as Record<string, unknown>;
          const code = String(s.stationCode || s.code || '').trim();
          if (!code) continue;
          const name = String(s.stationName || s.name || code).trim();
          const latitude = Number(s.latitude ?? s.lat);
          const longitude = Number(s.longitude ?? s.lng ?? s.long);
          mapped.push({
            stationCode: code,
            stationName: name,
            latitude: Number.isFinite(latitude) ? latitude : undefined,
            longitude: Number.isFinite(longitude) ? longitude : undefined,
          });
        }
        // Always include regional anchors
        for (const a of WEATHER_STATION_ANCHORS) {
          if (!mapped.some((m) => m.stationCode === a.stationCode)) {
            mapped.push({
              stationCode: a.stationCode,
              stationName: a.name,
              latitude: a.lat,
              longitude: a.lng,
            });
          }
        }
        if (!cancelled) setStations(mapped);
      } catch {
        if (!cancelled) {
          setStations(
            WEATHER_STATION_ANCHORS.map((a) => ({
              stationCode: a.stationCode,
              stationName: a.name,
              latitude: a.lat,
              longitude: a.lng,
            }))
          );
        }
      } finally {
        if (!cancelled) setStationsLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedStations = useMemo(() => {
    return [...stations]
      .map((s) => {
        const distanceKm =
          s.latitude != null && s.longitude != null
            ? calculateDistance(viewport.lat, viewport.lng, s.latitude, s.longitude)
            : undefined;
        return { ...s, distanceKm };
      })
      .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
  }, [stations, viewport.lat, viewport.lng]);

  const onStationChange = (value: string) => {
    if (!canEdit) return;
    if (!value) {
      updateSettings({ dpirdStationCode: '', dpirdStationName: '' });
      return;
    }
    const hit = sortedStations.find((s) => s.stationCode === value);
    updateSettings({
      dpirdStationCode: value,
      dpirdStationName: hit?.stationName || value,
    });
  };

  if (!showChill) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
        <BackLink />
        <h1 className="text-2xl font-bold text-slate-900">Weather events</h1>
        <p className="text-sm text-slate-500">
          Chill portions are shown for orchard, fruit, and vineyard enterprises. Add one in Farm
          setup to enable this page.
        </p>
      </div>
    );
  }

  const seasonLabel = chill.data?.seasonLabel ?? 'Chill season';
  const station = chill.data?.stationName;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <BackLink />
        <h1 className="text-2xl font-bold text-slate-900 mt-2">Weather events</h1>
        <p className="text-sm text-slate-500 mt-1">
          Chill portions for the farm (Dynamic Model). Date range filter coming later.
        </p>
        {(station || seasonLabel) && (
          <p className="text-xs text-slate-400 mt-1">
            {[station ? `DPIRD ${station}` : null, seasonLabel].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm space-y-2">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          <MapPin className="w-3.5 h-3.5 text-slate-400" />
          Weather station
        </div>
        <label className="block text-sm text-slate-700" htmlFor="dpird-station">
          DPIRD site for chill / weather data
        </label>
        <select
          id="dpird-station"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-60"
          value={preferredCode}
          disabled={!canEdit || stationsLoading}
          onChange={(e) => onStationChange(e.target.value)}
        >
          <option value="">Auto — nearest to map view</option>
          {sortedStations.map((s) => (
            <option key={s.stationCode} value={s.stationCode}>
              {s.stationName} ({s.stationCode})
              {s.distanceKm != null ? ` · ${s.distanceKm.toFixed(0)} km` : ''}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-400">
          {canEdit
            ? 'Pick a station manually, or leave on Auto to use the closest regional site to the current map view.'
            : 'Only admin / farmer can change the weather station.'}
        </p>
      </section>

      {chill.loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-8 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading chill portions…
        </div>
      ) : chill.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {chill.error}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MetricCard
            label="Last 24 hours"
            value={chill.data?.portionsLast24h}
            hint="Portions accumulated in the past day"
          />
          <MetricCard
            label="Season to date"
            value={chill.data?.totalPortions}
            hint={seasonLabel}
            emphasize
          />
        </div>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/"
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      Farm home
    </Link>
  );
}

function MetricCard({
  label,
  value,
  hint,
  emphasize,
}: {
  label: string;
  value: number | undefined;
  hint: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border px-4 py-4 shadow-sm',
        emphasize ? 'border-sky-200 bg-sky-50/80' : 'border-slate-200 bg-white'
      )}
    >
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <Snowflake className={cn('w-3.5 h-3.5', emphasize ? 'text-sky-600' : 'text-slate-400')} />
        {label}
      </div>
      <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-slate-900">
        {value == null ? '—' : value}
        <span className="ml-1.5 text-sm font-semibold text-slate-500">CP</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}
