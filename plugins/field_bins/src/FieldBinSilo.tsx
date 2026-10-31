import { useId } from 'react';
import { formatMoisture, formatTonnes } from '../../../shared/farm/fieldBinStock';

/** Wide round field bin: a taller wall on a broad cone, legs under the rim. */
const TOP = 28;
const CYL_BOTTOM = 76;
const TIP = 110;
const LEG_BOTTOM = 128;
const LEFT = 14;
const RIGHT = 146;
const CX = 80;
const RIM = (RIGHT - LEFT) / 2;
const QUARTERS = [
  { fraction: 0.25, label: '1/4' },
  { fraction: 0.5, label: '1/2' },
  { fraction: 0.75, label: '3/4' },
  { fraction: 1, label: '4/4' },
] as const;
const CONE_H = TIP - CYL_BOTTOM;
const CYL_H = CYL_BOTTOM - TOP;
/** Share of capacity that sits in the cone. A cone is one third of a cylinder of the same height. */
const CONE_SHARE = CONE_H / 3 / (CONE_H / 3 + CYL_H);

function surfaceY(fraction: number): number {
  if (fraction <= 0) return TIP;
  if (fraction >= 1) return TOP;
  if (fraction <= CONE_SHARE) return TIP - CONE_H * Math.cbrt(fraction / CONE_SHARE);
  return CYL_BOTTOM - ((fraction - CONE_SHARE) / (1 - CONE_SHARE)) * CYL_H;
}

function halfWidth(y: number): number {
  const full = (RIGHT - LEFT) / 2;
  if (y <= CYL_BOTTOM) return full;
  return (full * (TIP - y)) / CONE_H;
}

function grainPath(fraction: number): string {
  if (fraction <= 0) return '';
  const y = surfaceY(fraction);
  const left = CX - halfWidth(y);
  const right = CX + halfWidth(y);
  if (y >= CYL_BOTTOM) return `M ${left} ${y} L ${right} ${y} L ${CX} ${TIP} Z`;
  return `M ${left} ${y} L ${right} ${y} L ${RIGHT} ${CYL_BOTTOM} L ${CX} ${TIP} L ${LEFT} ${CYL_BOTTOM} Z`;
}

function grainColor(moisture: number | null): string {
  if (moisture == null) return '#e7e5e4';
  const t = Math.min(1, Math.max(0, moisture / 16));
  const dry = [253, 224, 71];
  const wet = [146, 64, 14];
  const mix = dry.map((channel, index) => Math.round(channel + (wet[index] - channel) * t));
  return `rgb(${mix.join(' ')})`;
}

/** Round cone-bottom field bin. The grain level is the share of capacity, not a straight height. */
export function FieldBinSilo({
  name,
  tonnes,
  capacityT,
  moisture,
  paddock,
  selected,
  disabled,
  onSelect,
  onAskLevel,
  onAskCapacity,
  onAskMoisture,
  onAskClear,
  onAskMove,
}: {
  name: string;
  tonnes: number;
  capacityT: number | null;
  moisture: number | null;
  paddock: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onAskLevel: () => void;
  onAskCapacity: () => void;
  onAskMoisture: () => void;
  onAskClear: () => void;
  onAskMove: () => void;
}) {
  const clipId = useId().replace(/:/g, '');
  const fraction = capacityT && capacityT > 0 ? Math.min(1, Math.max(0, tonnes / capacityT)) : 0;
  const interior = `M ${LEFT} ${TOP} L ${RIGHT} ${TOP} L ${RIGHT} ${CYL_BOTTOM} L ${CX} ${TIP} L ${LEFT} ${CYL_BOTTOM} Z`;
  return (
    <div
      className={`w-full rounded-2xl border px-2 py-3 text-center ${
        selected ? 'border-amber-700 bg-white ring-2 ring-amber-700' : 'border-slate-200 bg-white'
      }`}
    >
      <button type="button" aria-pressed={selected} onClick={onSelect} className="w-full text-center">
      <svg viewBox="0 0 196 136" className="mx-auto h-auto w-full" aria-hidden>
        <line x1={LEFT} y1={CYL_BOTTOM} x2={LEFT} y2={LEG_BOTTOM} stroke="#57534e" strokeWidth="2.5" />
        <line x1={RIGHT} y1={CYL_BOTTOM} x2={RIGHT} y2={LEG_BOTTOM} stroke="#57534e" strokeWidth="2.5" />
        <defs>
          <clipPath id={clipId}>
            <path d={interior} />
          </clipPath>
        </defs>
        <path d={grainPath(fraction)} fill={grainColor(moisture)} clipPath={`url(#${clipId})`} />
        <path d={interior} fill="none" stroke="#44403c" strokeWidth="2.25" strokeLinejoin="round" />
        <ellipse cx={CX} cy={CYL_BOTTOM} rx={RIM} ry="6" fill="none" stroke="#44403c" strokeWidth="2" />
        <ellipse cx={CX} cy={TOP} rx={RIM} ry="7" fill="none" stroke="#44403c" strokeWidth="2.25" />
        <path
          d={`M ${LEFT} ${TOP} L ${CX} 12 L ${RIGHT} ${TOP}`}
          fill="white"
          stroke="#44403c"
          strokeWidth="2.25"
          strokeLinejoin="round"
        />
        {QUARTERS.map(({ fraction: mark, label }) => {
          const y = surfaceY(mark);
          const x = CX + halfWidth(y);
          return (
            <g key={label}>
              <line x1={x - 14} y1={y} x2={x} y2={y} stroke="#44403c" strokeWidth="1.75" />
              <text x={x + 8} y={y} fill="#44403c" fontSize="13" dominantBaseline="middle">
                {label}
              </text>
            </g>
          );
        })}
        <ellipse cx={CX} cy={TIP + 2} rx="4" ry="2.2" fill="none" stroke="#44403c" strokeWidth="1.5" />
      </svg>
      <p className="font-bold text-slate-900">{name}</p>
      <p className="text-xs text-slate-500">{paddock}</p>
      </button>
      <button
        type="button"
        aria-label={`Moisture ${name}`}
        disabled={disabled}
        onClick={onAskMoisture}
        className="mt-1 w-full rounded-xl border border-slate-200 py-2 text-sm font-semibold tabular-nums text-slate-800 disabled:opacity-40"
      >
        {moisture == null ? 'Set moisture' : `${formatMoisture(moisture)} moisture`}
      </button>
      <button
        type="button"
        aria-label={`Level ${name}`}
        disabled={disabled}
        onClick={onAskLevel}
        className="mt-1 w-full rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-800"
      >
        {formatTonnes(tonnes)} filled
      </button>
      <button
        type="button"
        aria-label={`Capacity ${name}`}
        disabled={disabled}
        onClick={onAskCapacity}
        className="mt-1 w-full rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-800"
      >
        {capacityT ? `${formatTonnes(capacityT)} capacity` : 'Set capacity'}
      </button>
      <button
        type="button"
        aria-label={`Move ${name}`}
        disabled={disabled}
        onClick={onAskMove}
        className="mt-2 w-full rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
      >
        {paddock === 'Not on the map' ? 'Place' : 'Move'}
      </button>
      <button
        type="button"
        aria-label={`Clear ${name}`}
        disabled={disabled || tonnes <= 0}
        onClick={onAskClear}
        className="mt-2 w-full rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
      >
        Clear
      </button>
    </div>
  );
}
