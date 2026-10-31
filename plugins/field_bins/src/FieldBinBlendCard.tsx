import { useEffect, useState } from 'react';
import { eyeFractionLabel, recommendTruckBlend } from '../../../shared/farm/fieldBinBlend';
import {
  CBH_RECEIVAL_GRADES,
  defaultReceival,
  receivalGrade,
} from '../../../shared/farm/fieldBinReceival';
import {
  formatMoisture,
  formatTonnes,
  planTruckLoad,
  type FieldBinReceival,
  type FieldBinTrailer,
  type TruckFill,
} from '../../../shared/farm/fieldBinStock';
import { FieldBinKeypad } from './FieldBinKeypad';

type BlendBin = { id: string; name: string; tonnes: number; moisture: number | null; capacityT: number };

function shareLabel(percent: number, capacityT: number, tonnes: boolean): string {
  if (tonnes) return formatTonnes((percent / 100) * capacityT);
  const whole = Math.round(percent);
  const eye = eyeFractionLabel(whole);
  return eye ? `${eye} (${whole}%)` : `${whole}%`;
}

function blendSentence(
  fills: TruckFill[],
  trailers: FieldBinTrailer[],
  nameOf: (id: string) => string,
  tonnes: boolean
): { text: string; full: boolean } {
  const share = (trailer: FieldBinTrailer) =>
    fills
      .filter((fill) => fill.trailerId === trailer.id)
      .map((fill) => `${shareLabel(fill.percent, trailer.capacityT, tonnes)} ${nameOf(fill.binId)}`)
      .join(', ');
  const shares = trailers.map((trailer) => share(trailer)).filter((row) => row !== '');
  const same = shares.every((row) => row === shares[0]);
  const full = trailers.every((trailer) => {
    const sum = fills.filter((fill) => fill.trailerId === trailer.id).reduce((total, fill) => total + fill.percent, 0);
    return sum >= 100 - 1e-6;
  });
  const text = same
    ? `${shares[0] ?? ''} of each trailer.`
    : trailers
        .map((trailer, index) => {
          const row = share(trailer);
          return row ? `Trailer ${index + 1}: ${row}.` : '';
        })
        .filter(Boolean)
        .join(' ');
  return { text, full };
}

/** CBH grade, the delivery moisture, and a pour that aims at that moisture. */
export function FieldBinBlendCard({
  bins,
  trailers,
  receival,
  disabled,
  onReceival,
  onUse,
  onPreview,
}: {
  bins: BlendBin[];
  trailers: FieldBinTrailer[];
  receival?: FieldBinReceival;
  disabled: boolean;
  onReceival: (next: FieldBinReceival) => void;
  onUse: (fills: TruckFill[]) => void;
  onPreview: (fills: TruckFill[]) => void;
}) {
  const chosen = receival ?? defaultReceival();
  const grade = receivalGrade(chosen.gradeId) ?? receivalGrade(defaultReceival().gradeId);
  const standard = grade?.moistureMax ?? chosen.deliverAt;
  const [editing, setEditing] = useState<'deliver' | 'trailer' | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tonnes, setTonnes] = useState(false);
  const blend = recommendTruckBlend({
    trailers,
    deliverAt: chosen.deliverAt,
    trailerMax: chosen.trailerMax,
    bins: bins.map((bin) => ({ id: bin.id, tonnes: bin.tonnes, moisture: bin.moisture })),
  });
  const blendPlan =
    blend.ok === true
      ? planTruckLoad({
          trailers,
          fills: blend.fills,
          bins: Object.fromEntries(
            bins.map((bin) => [bin.id, { tonnes: bin.tonnes, capacityT: bin.capacityT, moisture: bin.moisture }])
          ),
        })
      : null;
  const nameOf = (id: string) => bins.find((bin) => bin.id === id)?.name || 'Field bin';
  const copy = blend.ok === true ? blendSentence(blend.fills, trailers, nameOf, tonnes) : null;
  const previewKey = blend.ok === true ? blend.fills.map((fill) => `${fill.trailerId}:${fill.binId}:${fill.percent}`).join('|') : '';
  useEffect(() => {
    onPreview(blend.ok === true ? blend.fills : []);
  }, [previewKey]);

  const commitLimit = () => {
    if (!editing) return;
    if (draft.trim() === '') {
      setEditing(null);
      setError(null);
      return;
    }
    const figure = Number(draft);
    if (!Number.isFinite(figure) || figure < 0 || figure > 100) {
      setError('Moisture has to be from 0 to 100%.');
      return;
    }
    if (editing === 'trailer' && figure + 1e-9 < chosen.deliverAt) {
      setError('No trailer limit can sit under the delivery moisture.');
      return;
    }
    const deliverAt = editing === 'deliver' ? figure : chosen.deliverAt;
    const trailerMax = editing === 'trailer' ? figure : Math.max(chosen.trailerMax, deliverAt);
    onReceival({ gradeId: chosen.gradeId, deliverAt, trailerMax });
    setError(null);
    setEditing(null);
  };

  return (
    <section className="rounded-xl bg-white border border-slate-200 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">Recommended blend</p>
        <div className="flex rounded-xl bg-slate-100 p-0.5">
          <button
            type="button"
            aria-pressed={!tonnes}
            onClick={() => setTonnes(false)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${tonnes ? 'text-slate-600' : 'bg-white text-slate-900 shadow-sm'}`}
          >
            By eye
          </button>
          <button
            type="button"
            aria-pressed={tonnes}
            onClick={() => setTonnes(true)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${tonnes ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
          >
            Tonnes
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {CBH_RECEIVAL_GRADES.map((row) => {
          const selected = row.id === chosen.gradeId;
          return (
            <button
              key={row.id}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onReceival({ gradeId: row.id, deliverAt: row.moistureMax, trailerMax: row.moistureMax })}
              className={`px-3 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 ${
                selected ? 'bg-amber-700 text-white' : 'bg-slate-100 text-slate-900'
              }`}
            >
              {row.label}
              <span className={`block text-xs font-medium ${selected ? 'text-amber-100' : 'text-slate-500'}`}>
                CBH {formatMoisture(row.moistureMax)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setEditing('deliver');
            setDraft('');
            setError(null);
          }}
          className="rounded-xl bg-slate-100 px-3 py-3 text-left"
        >
          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Deliver at</span>
          <span className="block text-2xl font-bold text-slate-900 tabular-nums">{formatMoisture(chosen.deliverAt)}</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setEditing('trailer');
            setDraft('');
            setError(null);
          }}
          className="rounded-xl bg-slate-100 px-3 py-3 text-left"
        >
          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">No trailer over</span>
          <span className="block text-2xl font-bold text-slate-900 tabular-nums">{formatMoisture(chosen.trailerMax)}</span>
        </button>
      </div>
      {chosen.deliverAt !== standard || chosen.trailerMax !== standard ? (
        <p className="text-xs text-slate-500">CBH standard for {grade?.label ?? 'this grade'} is {formatMoisture(standard)}.</p>
      ) : null}
      {blend.ok === false || blendPlan?.ok === false || !copy ? (
        <p className="text-sm text-slate-600">
          {blend.ok === false ? blend.error : blendPlan?.ok === false ? blendPlan.error : 'No blend.'}
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-700">
            {copy.text}
            {blendPlan?.ok ? ` Moisture ${formatMoisture(blendPlan.mixMoisture)}.` : ''}
            {copy.full ? '' : ' The bins do not hold a full truck.'}
            {blend.skippedIds.length > 0
              ? ` ${blend.skippedIds.map(nameOf).join(', ')} ${blend.skippedIds.length === 1 ? 'has' : 'have'} grain and no moisture, so ${
                  blend.skippedIds.length === 1 ? 'it stays' : 'they stay'
                } out.`
              : ''}
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onUse(blend.ok === true ? blend.fills : [])}
            className="px-4 py-2 rounded-xl bg-amber-700 text-white text-sm font-semibold disabled:opacity-40"
          >
            Use this blend
          </button>
        </>
      )}
      {editing && (
        <FieldBinKeypad
          label={editing === 'deliver' ? 'Deliver at %' : 'No trailer over %'}
          value={draft}
          error={error}
          onChange={setDraft}
          onEnter={commitLimit}
          onClose={() => {
            setEditing(null);
            setError(null);
          }}
        />
      )}
    </section>
  );
}
