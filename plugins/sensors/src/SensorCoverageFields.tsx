import { useMemo, useState } from 'react';
import {
  resolvedBlockIds,
  type SensorBinding,
} from '../../../shared/farm/sensorBindings';
import {
  SENSOR_RADIUS_MAX_M,
  SENSOR_RADIUS_MIN_M,
  clampSensorRadiusM,
  effectiveSensorRadiusM,
  formatSensorRadius,
} from '../../../shared/farm/sensorCoverage';

type BlockRow = { id: string; name: string; geojson?: unknown };

function sliderToRadius(position: number): number {
  const min = Math.log(SENSOR_RADIUS_MIN_M);
  const max = Math.log(SENSOR_RADIUS_MAX_M);
  const t = Math.min(1, Math.max(0, position / 1000));
  return clampSensorRadiusM(Math.exp(min + t * (max - min)));
}

function radiusToSlider(radiusM: number): number {
  const min = Math.log(SENSOR_RADIUS_MIN_M);
  const max = Math.log(SENSOR_RADIUS_MAX_M);
  const t = (Math.log(clampSensorRadiusM(radiusM)) - min) / (max - min);
  return Math.round(t * 1000);
}

function radiusInputText(radiusM: number, unit: 'm' | 'km'): string {
  if (unit === 'm') return String(Math.round(radiusM));
  const km = radiusM / 1000;
  const digits = km >= 10 ? 1 : 2;
  return (Math.round(km * 10 ** digits) / 10 ** digits).toString();
}

export function SensorCoverageFields({
  pinId,
  pin,
  binding,
  blocks,
  disabled,
  onChange,
}: {
  pinId: string;
  pin: { lat: number; lng: number; type?: string | null };
  binding: SensorBinding;
  blocks: BlockRow[];
  disabled?: boolean;
  onChange: (next: SensorBinding) => void;
}) {
  const radiusM = effectiveSensorRadiusM(pin.type, binding.radiusM);
  const manual = Array.isArray(binding.blockIds);
  const [unit, setUnit] = useState<'m' | 'km'>(radiusM >= 1000 ? 'km' : 'm');
  const [draft, setDraft] = useState<string | null>(null);

  const coveredIds = useMemo(
    () => resolvedBlockIds({ ...binding, blockIds: undefined }, pin, blocks),
    [binding, pin, blocks]
  );
  const assignedIds = manual ? binding.blockIds ?? [] : coveredIds;
  const nameOf = (id: string) => blocks.find((b) => b.id === id)?.name?.trim() || 'Unnamed paddock';

  const commitDraft = () => {
    if (draft === null) return;
    const n = Number(draft);
    setDraft(null);
    if (!Number.isFinite(n)) return;
    const metres = unit === 'km' ? n * 1000 : n;
    onChange({ ...binding, radiusM: clampSensorRadiusM(metres) });
  };

  const setRadius = (metres: number) => {
    setDraft(null);
    onChange({ ...binding, radiusM: clampSensorRadiusM(metres) });
  };

  const setManual = (on: boolean) => {
    if (!on) {
      const { blockIds: _removed, ...rest } = binding;
      onChange(rest);
      return;
    }
    onChange({ ...binding, blockIds: coveredIds });
  };

  const toggleBlock = (id: string) => {
    const current = binding.blockIds ?? [];
    const next = current.includes(id) ? current.filter((row) => row !== id) : [...current, id];
    onChange({ ...binding, blockIds: next });
  };

  return (
    <div className="space-y-3 rounded-xl bg-slate-50 border border-slate-200 p-3">
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label
            htmlFor={`sensor-radius-${pinId}`}
            className="text-xs font-semibold text-slate-600 uppercase tracking-wider"
          >
            Coverage radius
          </label>
          <span className="text-sm font-semibold text-slate-800">{formatSensorRadius(radiusM)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={radiusToSlider(radiusM)}
          disabled={disabled}
          aria-label="Coverage radius"
          onChange={(e) => setRadius(sliderToRadius(Number(e.target.value)))}
          className="w-full accent-indigo-600 disabled:opacity-50"
        />
        <div className="flex gap-2">
          <input
            id={`sensor-radius-${pinId}`}
            type="number"
            inputMode="decimal"
            min={unit === 'km' ? SENSOR_RADIUS_MIN_M / 1000 : SENSOR_RADIUS_MIN_M}
            max={unit === 'km' ? SENSOR_RADIUS_MAX_M / 1000 : SENSOR_RADIUS_MAX_M}
            step={unit === 'km' ? 0.1 : 1}
            disabled={disabled}
            value={draft ?? radiusInputText(radiusM, unit)}
            onFocus={() => setDraft(radiusInputText(radiusM, unit))}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white disabled:bg-slate-50"
          />
          <select
            aria-label="Radius unit"
            value={unit}
            disabled={disabled}
            onChange={(e) => {
              setDraft(null);
              setUnit(e.target.value as 'm' | 'km');
            }}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white disabled:bg-slate-50"
          >
            <option value="m">m</option>
            <option value="km">km</option>
          </select>
        </div>
        <p className="text-[11px] text-slate-500">
          {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)} · 1 m to 50 km
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Paddocks</p>
        {manual ? (
          <p className="text-[11px] text-slate-500">Manual list. The radius still draws on the map.</p>
        ) : assignedIds.length === 0 ? (
          <p className="text-sm text-slate-500">No paddocks inside this radius.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {assignedIds.map((id) => (
              <li
                key={id}
                className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-100"
              >
                {nameOf(id)}
              </li>
            ))}
          </ul>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={manual}
            disabled={disabled}
            onChange={(e) => setManual(e.target.checked)}
          />
          Choose paddocks manually
        </label>
        {manual && (
          <ul className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
            {blocks.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">No paddocks on this farm yet.</li>
            ) : (
              blocks.map((block) => (
                <li key={block.id}>
                  <label className="flex items-center gap-2 px-3 py-2 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={assignedIds.includes(block.id)}
                      disabled={disabled}
                      onChange={() => toggleBlock(block.id)}
                    />
                    {block.name?.trim() || 'Unnamed paddock'}
                  </label>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
