import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Radio } from 'lucide-react';
import {
  SENSOR_INFRA_TYPE_IDS,
  getInfraType,
  isSensorInfraType,
  type SensorInfraTypeId,
} from '../../../shared/farm/infraTypes';
import {
  SENSOR_SOURCES,
  defaultBinding,
  type SensorSource,
} from '../../../shared/farm/sensorBindings';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useMapStore } from '../../../src/lib/mapStore';
import { cn } from '../../../src/lib/utils';
import { SensorBindingFields } from './SensorBindingFields';
import { SensorCoverageFields } from './SensorCoverageFields';
import { useSensorSettings } from './useSensorSettings';

const SOURCE_LABELS: Record<SensorSource, string> = {
  manual: 'Manual',
  dpird: 'DPIRD',
  other: 'Other',
};

export function Sensors() {
  const { userData } = useAuth();
  const farmId = userData?.farmId;
  const { pins, blocks, loadData, isLoaded, updatePin, canEdit } = useMapStore();
  const { settings, loading, upsertBinding } = useSensorSettings(farmId, canEdit);
  const [classFilter, setClassFilter] = useState<SensorInfraTypeId | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<SensorSource | 'all'>('all');

  useEffect(() => {
    if (farmId && !isLoaded) void loadData(farmId);
  }, [farmId, isLoaded, loadData]);

  const anySensorPins = useMemo(() => pins.some((p) => isSensorInfraType(p.type)), [pins]);

  const sensorPins = useMemo(() => {
    return pins.filter((p) => {
      if (!isSensorInfraType(p.type)) return false;
      if (classFilter !== 'all' && p.type !== classFilter) return false;
      const source = settings.bindings[p.id]?.source ?? 'manual';
      if (sourceFilter !== 'all' && source !== sourceFilter) return false;
      return true;
    });
  }, [pins, settings.bindings, classFilter, sourceFilter]);

  const grouped = useMemo(() => {
    return SENSOR_INFRA_TYPE_IDS.map((id) => ({
      id,
      pins: sensorPins.filter((p) => p.type === id),
    })).filter((g) => g.pins.length > 0);
  }, [sensorPins]);

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4 pb-24 lg:pb-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 inline-flex items-center gap-2">
          <Radio className="w-6 h-6 text-indigo-600" />
          Sensors
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Name weather, soil, and irrigation pins, set how far each one covers, and see which
          paddocks fall inside that circle. Place the dots on the{' '}
          <Link to="/map" className="text-emerald-700 font-semibold hover:underline">
            Farm Map
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setClassFilter('all')}
          className={cn(
            'px-2.5 py-1 rounded-lg text-xs font-medium border',
            classFilter === 'all'
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-slate-600 border-slate-200'
          )}
        >
          All classes
        </button>
        {SENSOR_INFRA_TYPE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setClassFilter(id)}
            className={cn(
              'px-2.5 py-1 rounded-lg text-xs font-medium border',
              classFilter === id
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-200'
            )}
          >
            {getInfraType(id)?.shortLabel}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSourceFilter('all')}
          className={cn(
            'px-2.5 py-1 rounded-lg text-xs font-medium border',
            sourceFilter === 'all'
              ? 'bg-slate-800 text-white border-slate-800'
              : 'bg-white text-slate-600 border-slate-200'
          )}
        >
          All sources
        </button>
        {SENSOR_SOURCES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSourceFilter(s)}
            className={cn(
              'px-2.5 py-1 rounded-lg text-xs font-medium border',
              sourceFilter === s
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-600 border-slate-200'
            )}
          >
            {SOURCE_LABELS[s]}
          </button>
        ))}
      </div>

      {loading || !isLoaded ? (
        <p className="text-sm text-slate-500">Loading sensors…</p>
      ) : sensorPins.length === 0 ? (
        <div className="p-4 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-500">
          {anySensorPins
            ? 'No sensors match these filters.'
            : 'Place a weather / soil / irrigation pin on the map, then set its source here.'}
        </div>
      ) : (
        grouped.map((group) => (
          <section key={group.id} className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {getInfraType(group.id)?.label}
            </h2>
            {group.pins.map((pin) => {
              const binding = settings.bindings[pin.id] ?? defaultBinding();
              return (
                <div
                  key={pin.id}
                  className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                        Name
                      </label>
                      <input
                        type="text"
                        value={pin.name}
                        disabled={!canEdit || !farmId}
                        onChange={(e) => updatePin(pin.id, { name: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm disabled:bg-slate-50"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                        Class
                      </label>
                      <select
                        value={pin.type}
                        disabled={!canEdit || !farmId}
                        onChange={(e) =>
                          updatePin(pin.id, { type: e.target.value as SensorInfraTypeId })
                        }
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white disabled:bg-slate-50"
                      >
                        {SENSOR_INFRA_TYPE_IDS.map((id) => (
                          <option key={id} value={id}>
                            {getInfraType(id)?.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                        Status
                      </label>
                      <select
                        value={pin.status}
                        disabled={!canEdit || !farmId}
                        onChange={(e) =>
                          updatePin(pin.id, {
                            status: e.target.value as 'active' | 'warning' | 'offline',
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white disabled:bg-slate-50"
                      >
                        <option value="active">Active (Online)</option>
                        <option value="warning">Warning (Needs Attention)</option>
                        <option value="offline">Offline (Maintenance)</option>
                      </select>
                    </div>
                  </div>
                  <SensorCoverageFields
                    pinId={pin.id}
                    pin={pin}
                    binding={binding}
                    blocks={blocks}
                    disabled={!canEdit}
                    onChange={(next) => void upsertBinding(pin.id, next)}
                  />
                  <SensorBindingFields
                    binding={binding}
                    disabled={!canEdit}
                    onChange={(next) => void upsertBinding(pin.id, next)}
                  />
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Notes
                    </label>
                    <textarea
                      value={pin.notes || ''}
                      disabled={!canEdit || !farmId}
                      onChange={(e) => updatePin(pin.id, { notes: e.target.value || undefined })}
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm disabled:bg-slate-50 resize-y min-h-[3.5rem]"
                      placeholder="Optional notes"
                    />
                  </div>
                </div>
              );
            })}
          </section>
        ))
      )}
    </div>
  );
}
