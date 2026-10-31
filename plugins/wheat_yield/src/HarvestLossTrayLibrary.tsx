import { useState } from 'react';
import { TRAYS, customTrayAreaM2, type CustomTray } from './estimateHarvestLoss';

function num(raw: string): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

/** Built-in trays plus trays made on the farm. The pressed tray is the next drop. */
export function HarvestLossTrayLibrary({
  trays,
  selectedId,
  onSelect,
  onTrays,
}: {
  trays: CustomTray[];
  selectedId: string;
  onSelect: (id: string) => void;
  onTrays: (trays: CustomTray[]) => void;
}) {
  const [name, setName] = useState('');
  const [shape, setShape] = useState<'rect' | 'round'>('rect');
  const [widthCm, setWidthCm] = useState('');
  const [lengthCm, setLengthCm] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const preview = customTrayAreaM2({
    shape,
    widthCm: num(widthCm),
    lengthCm: shape === 'round' ? num(widthCm) : num(lengthCm),
  });

  const save = () => {
    const label = name.trim().slice(0, 32);
    const width = num(widthCm);
    const length = shape === 'round' ? width : num(lengthCm);
    if (!label) {
      setNote('Name the tray.');
      return;
    }
    if (customTrayAreaM2({ shape, widthCm: width, lengthCm: length }) == null) {
      setNote('Enter the sides in centimetres, from 5 to 250.');
      return;
    }
    if (trays.length >= 12) {
      setNote('Twelve saved trays is the limit. Remove one first.');
      return;
    }
    const id = crypto.randomUUID();
    onTrays([...trays, { id, label, shape, widthCm: width, lengthCm: length }]);
    onSelect(id);
    setName('');
    setWidthCm('');
    setLengthCm('');
    setNote('Saved on this device. It is included the next time you save a paddock.');
  };

  const remove = (id: string) => {
    onTrays(trays.filter((tray) => tray.id !== id));
    if (selectedId === id) onSelect('square30');
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 space-y-3 min-w-0">
      <h2 className="text-sm font-semibold text-slate-800">Tray to drop</h2>
      <p className="text-xs text-slate-500">Choose the tray, then tap a band. A tray you make is kept for the next paddock.</p>
      <div className="flex flex-wrap gap-1">
        {TRAYS.map((tray) => (
          <button
            key={tray.id}
            type="button"
            aria-pressed={selectedId === tray.id}
            onClick={() => onSelect(tray.id)}
            className={`px-2 py-1 rounded-lg text-xs font-semibold ${
              selectedId === tray.id ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {tray.label}
          </button>
        ))}
        {trays.map((tray) => (
          <span key={tray.id} className="inline-flex items-center gap-1">
            <button
              type="button"
              aria-pressed={selectedId === tray.id}
              onClick={() => onSelect(tray.id)}
              className={`px-2 py-1 rounded-lg text-xs font-semibold ${
                selectedId === tray.id ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {tray.label}
            </button>
            <button type="button" className="text-xs font-semibold text-slate-400" onClick={() => remove(tray.id)}>
              Remove
            </button>
          </span>
        ))}
      </div>
      <div className="rounded-lg border border-dashed border-slate-300 p-3 space-y-2">
        <p className="text-xs font-semibold text-slate-700">Tray you made</p>
        <label className="block text-xs text-slate-500">
          Name
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900"
            value={name}
            maxLength={32}
            placeholder="Shop tray"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className="flex rounded-lg bg-slate-100 p-0.5 w-fit">
          <button
            type="button"
            aria-pressed={shape === 'rect'}
            onClick={() => setShape('rect')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold ${shape === 'rect' ? 'bg-white shadow-sm' : 'text-slate-600'}`}
          >
            Rectangle
          </button>
          <button
            type="button"
            aria-pressed={shape === 'round'}
            onClick={() => setShape('round')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold ${shape === 'round' ? 'bg-white shadow-sm' : 'text-slate-600'}`}
          >
            Round
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-slate-500">
            {shape === 'round' ? 'Diameter (cm)' : 'Width (cm)'}
            <input
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900"
              value={widthCm}
              onChange={(event) => setWidthCm(event.target.value)}
            />
          </label>
          {shape === 'rect' ? (
            <label className="block text-xs text-slate-500">
              Length (cm)
              <input
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900"
                value={lengthCm}
                onChange={(event) => setLengthCm(event.target.value)}
              />
            </label>
          ) : (
            <p className="self-end pb-2 text-xs text-slate-500">{preview == null ? '' : `${preview.toFixed(3)} m²`}</p>
          )}
        </div>
        {shape === 'rect' && preview != null ? <p className="text-xs text-slate-500">{preview.toFixed(3)} m²</p> : null}
        {note ? <p className="text-xs text-slate-600">{note}</p> : null}
        <button type="button" onClick={save} className="rounded-lg bg-slate-800 text-white px-3 py-2 text-sm font-semibold">
          Save tray
        </button>
      </div>
    </section>
  );
}
