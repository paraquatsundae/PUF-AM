import { formatRiskValue } from '../../lib/blightSeason';

/** Recharts default tooltip shows the raw X timestamp (13-digit ms). Format as a date + weather. */
export function BlightChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    color?: string;
    stroke?: string;
    fill?: string;
    dataKey?: string;
    payload?: Record<string, unknown>;
  }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload as
    | {
        T?: number;
        WD?: number;
        R?: number;
        RH?: number;
        dateStr?: string;
        fullDate?: string;
        isPersistence?: boolean;
        isForecast?: boolean;
      }
    | undefined;

  const dateLabel =
    typeof label === 'number' && Number.isFinite(label)
      ? new Date(label).toLocaleDateString('en-AU', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : row?.fullDate || row?.dateStr || String(label ?? '');

  return (
    <div className="rounded-lg bg-white px-3 py-2.5 shadow-md border border-slate-100 text-xs min-w-[180px]">
      <p className="font-semibold text-slate-900 mb-1">
        {dateLabel}
        {row?.isForecast && (
          <span className="ml-2 text-[10px] font-medium text-sky-500">forecast</span>
        )}
        {row?.isPersistence && (
          <span className="ml-2 text-[10px] font-medium text-slate-400">persistence</span>
        )}
      </p>
      {row && (row.T != null || row.WD != null) && (
        <p className="text-slate-500 mb-2 leading-snug">
          {[
            row.T != null ? `${row.T}°C` : null,
            row.WD != null ? `${row.WD} h wet` : null,
            row.R != null ? `${row.R} mm rain` : null,
            row.RH != null ? `${row.RH}% RH` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={String(entry.dataKey ?? entry.name)} className="flex items-center justify-between gap-4">
            <span style={{ color: entry.color || entry.stroke || entry.fill }} className="font-medium">
              {entry.name}
            </span>
            <span className="font-semibold text-slate-800 tabular-nums">
              {typeof entry.value === 'number' ? formatRiskValue(entry.value) : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
