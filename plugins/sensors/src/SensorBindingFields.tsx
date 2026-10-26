import {
  SENSOR_SOURCES,
  type SensorBinding,
  type SensorSource,
} from '../../../shared/farm/sensorBindings';

const SOURCE_LABELS: Record<SensorSource, string> = {
  manual: 'Manual',
  dpird: 'DPIRD',
  other: 'Other',
};

export function SensorBindingFields({
  binding,
  disabled,
  onChange,
}: {
  binding: SensorBinding;
  disabled?: boolean;
  onChange: (next: SensorBinding) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
          Input source
        </label>
        <select
          value={binding.source}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...binding, source: e.target.value as SensorSource })
          }
          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white disabled:bg-slate-50"
        >
          {SENSOR_SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
          External id
        </label>
        <input
          type="text"
          value={binding.externalId || ''}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...binding, externalId: e.target.value || undefined })
          }
          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm disabled:bg-slate-50"
          placeholder="Station / probe id (optional)"
        />
      </div>
    </div>
  );
}
