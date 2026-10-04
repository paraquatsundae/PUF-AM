import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DendrometerReading } from './demoSeries';
import type { NormalizedDendrometerReading } from './dendrometerSeries';

type Props = {
  title: string;
  description: string;
  data: readonly (DendrometerReading | NormalizedDendrometerReading)[];
  normalized?: boolean;
};

function shortDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });
}

export function DendrometerChart({ title, description, data, normalized = false }: Props) {
  const aKey = normalized ? 'sensorANormalized' : 'sensorA';
  const bKey = normalized ? 'sensorBNormalized' : 'sensorB';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="h-80 w-full" aria-label={title}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={[...data]} syncId="dendrometer-demo" syncMethod="value" accessibilityLayer margin={{ top: 8, right: 18, left: 12, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={48} tick={{ fontSize: 11 }} />
            <YAxis
              width={62}
              tick={{ fontSize: 11 }}
              domain={normalized ? [0, 'auto'] : ['dataMin - 0.5', 'dataMax + 0.5']}
              label={{ value: normalized ? 'Above minimum (mm)' : 'Diameter (mm)', angle: -90, position: 'insideLeft', fontSize: 11 }}
            />
            <Tooltip
              labelFormatter={(value) => new Date(`${String(value)}T00:00:00Z`).toLocaleDateString('en-AU', { dateStyle: 'medium', timeZone: 'UTC' })}
              formatter={(value, name) => [`${Number(value).toFixed(2)} mm`, name]}
            />
            <Legend />
            <Line type="linear" dataKey={aKey} name="Dendrometer A" stroke="#2563eb" strokeWidth={2} dot={data.length === 1} activeDot={{ r: 4 }} isAnimationActive={false} />
            <Line type="linear" dataKey={bKey} name="Dendrometer B" stroke="#059669" strokeWidth={2} strokeDasharray="6 3" dot={data.length === 1} activeDot={{ r: 4 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
