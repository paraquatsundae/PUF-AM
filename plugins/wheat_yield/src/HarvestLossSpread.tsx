import { SPREAD_ZONES, type LossBand, type SpreadZoneId } from './estimateHarvestLoss';

type PictureDrop = { zone: SpreadZoneId };

function shortKg(value: number): string {
  if (value >= 100) return Math.round(value).toLocaleString('en-AU');
  return value.toLocaleString('en-AU', { maximumFractionDigits: 1 });
}

/** Header bar, five bands, and the loss in each band once several trays are in. */
export function HarvestLossSpread({
  headerM,
  spreadM,
  drops,
  bands,
  onAdd,
}: {
  headerM: number;
  spreadM: number;
  drops: PictureDrop[];
  bands: LossBand[];
  onAdd: (zone: SpreadZoneId) => void;
}) {
  const span = Math.max(headerM, spreadM, 0.001);
  const headerPct = headerM > 0 ? (headerM / span) * 100 : 100;
  const spreadPct = spreadM > 0 ? (spreadM / span) * 100 : headerPct;
  const measured = bands.reduce((sum, band) => sum + band.dropCount, 0);
  const peak = Math.max(...bands.map((band) => band.kgPerHa ?? 0), 0);
  const showBars = measured >= 2 && peak > 0;

  return (
    <div className="space-y-2">
      <div className="mx-auto h-3 rounded-full bg-slate-800" style={{ width: `${headerPct}%` }} />
      <p className="text-center text-xs text-slate-500">Header {headerM > 0 ? `${headerM} m` : '—'}</p>
      {showBars ? (
        <div className="mx-auto grid h-16 grid-cols-5 items-end gap-1" style={{ width: `${spreadPct}%` }}>
          {SPREAD_ZONES.map((zone) => {
            const band = bands.find((row) => row.zone === zone.id);
            const kgPerHa = band?.kgPerHa;
            const height = kgPerHa == null || peak <= 0 ? 0 : Math.max(12, (kgPerHa / peak) * 100);
            return (
              <div key={zone.id} className="flex h-full flex-col justify-end">
                <div
                  className="rounded-t bg-amber-500"
                  style={{ height: `${height}%` }}
                  title={kgPerHa == null ? zone.label : `${zone.label} ${shortKg(kgPerHa)} kg/ha`}
                />
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="mx-auto grid grid-cols-5 gap-1" style={{ width: `${spreadPct}%` }}>
        {SPREAD_ZONES.map((zone) => {
          const count = drops.filter((drop) => drop.zone === zone.id).length;
          const kgPerHa = bands.find((row) => row.zone === zone.id)?.kgPerHa;
          const kgLabel = kgPerHa == null ? '' : `${shortKg(kgPerHa)} kg/ha`;
          return (
            <button
              key={zone.id}
              type="button"
              onClick={() => onAdd(zone.id)}
              aria-label={kgLabel ? `${zone.label}, ${count} drops, ${kgLabel}` : `${zone.label}, add a drop`}
              className={`min-h-[4rem] rounded-lg border px-1 py-2 text-center ${
                count > 0 ? 'border-amber-700 bg-amber-100' : 'border-amber-200 bg-amber-50'
              }`}
            >
              <span className="block text-[10px] font-semibold leading-tight text-slate-700">{zone.label}</span>
              <span className="mt-1 block text-sm font-bold text-slate-900">{count > 0 ? count : '·'}</span>
              {showBars && kgLabel ? <span className="mt-0.5 block text-[10px] text-slate-600">{kgLabel}</span> : null}
            </button>
          );
        })}
      </div>
      <p className="text-center text-xs text-slate-500">
        {showBars
          ? `Spread ${spreadM > 0 ? `${spreadM} m` : '—'} · bar height is the loss in that band`
          : `Spread ${spreadM > 0 ? `${spreadM} m` : '—'} · tap a band to add a drop`}
      </p>
    </div>
  );
}
