import { useState } from 'react';
import {
  capacityChangeError,
  formatMoisture,
  formatTonnes,
  type FieldBinSettings,
  type FieldBinVehicle,
} from '../../../shared/farm/fieldBinStock';
import { fieldBinPlaces } from '../../../shared/farm/fieldBinPlace';
import type { InfrastructurePin } from '../../../src/lib/mapStore';
import { FieldBinClearConfirm } from './FieldBinClearConfirm';
import { FieldBinKeypad } from './FieldBinKeypad';
import { FieldBinModeSwitch, type FieldBinMode } from './FieldBinModeSwitch';

const QUARTERS = [
  { label: '4/4', fraction: 1 },
  { label: '3/4', fraction: 0.75 },
  { label: '1/2', fraction: 0.5 },
  { label: '1/4', fraction: 0.25 },
] as const;

type KeypadTarget = 'moisture' | 'tonnes' | 'capacity';

export function FieldBinChaserPage({
  pins,
  settings,
  stock,
  vehicleStock,
  disabled,
  onMode,
  onCommit,
  onSaveBin,
  onRename,
  onVehicles,
  onClearVehicle,
}: {
  pins: InfrastructurePin[];
  settings: FieldBinSettings;
  stock: Record<string, { tonnes: number; moisture: number | null }>;
  vehicleStock: Record<string, { tonnes: number; moisture: number | null }>;
  disabled: boolean;
  onMode: (mode: FieldBinMode) => void;
  onCommit: (draft: {
    vehicleId: string;
    moisture?: number;
    lines: { binId: string; percent: number; base: 'load' }[];
  }) => Promise<{ ok: boolean; error?: string }>;
  onSaveBin: (pinId: string, capacityT: number) => void;
  onRename: (pinId: string, name: string) => void;
  onVehicles: (vehicles: FieldBinVehicle[]) => void;
  onClearVehicle: (vehicleId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const chasers = settings.vehicles.filter((row) => row.kind === 'chaser');
  const bins = fieldBinPlaces(pins, settings);
  const [chaserId, setChaserId] = useState(chasers[0]?.id ?? '');
  const [quarter, setQuarter] = useState<number | null>(null);
  const [scaleTonnes, setScaleTonnes] = useState('');
  const [moisture, setMoisture] = useState('');
  const [keypad, setKeypad] = useState<{ target: KeypadTarget; binId?: string; draft: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCapacity, setNewCapacity] = useState('');
  const [newScales, setNewScales] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState<{
    id: string;
    name: string;
    tonnes: number;
    moisture: number | null;
    pendingLoad: boolean;
  } | null>(null);
  const [clearing, setClearing] = useState(false);

  const chaser = chasers.find((row) => row.id === chaserId) ?? chasers[0];
  const fillFraction = chaser?.scales
    ? Number(scaleTonnes) / (chaser.capacityT || 1)
    : (quarter ?? 0);
  const fillPercent = Math.max(0, Math.min(100, fillFraction * 100));
  const loadTonnes = chaser ? (fillFraction > 0 ? (fillFraction * chaser.capacityT) : 0) : 0;

  const openKeypad = (target: KeypadTarget, binId?: string) => {
    setKeypad({ target, binId, draft: '' });
  };

  const commitKeypad = () => {
    if (!keypad) return;
    if ((keypad.target === 'moisture' || keypad.target === 'tonnes') && keypad.draft.trim() === '') {
      setKeypad(null);
      return;
    }
    const figure = Number(keypad.draft);
    if (keypad.target === 'moisture') {
      if (!Number.isFinite(figure) || figure < 0 || figure > 100) {
        setError('Moisture has to be from 0 to 100.');
        return;
      }
      setMoisture(keypad.draft);
      setError(null);
      setKeypad(null);
      return;
    }
    if (keypad.target === 'tonnes') {
      if (!chaser || !Number.isFinite(figure) || figure <= 0 || figure > chaser.capacityT + 1e-6) {
        setError(chaser ? `Tonnes have to be above 0 and at most ${formatTonnes(chaser.capacityT)}.` : 'Add a chaser first.');
        return;
      }
      setScaleTonnes(keypad.draft);
      setError(null);
      setKeypad(null);
      return;
    }
    const problem = capacityChangeError(0, figure);
    if (!keypad.binId || problem) {
      setError(problem ?? 'Set a capacity.');
      return;
    }
    onSaveBin(keypad.binId, figure);
    setError(null);
    setKeypad(null);
  };

  const unload = async (pin: { id: string; name?: string }) => {
    if (!chaser || disabled || busy) return;
    if (settings.bins[pin.id]?.capacityT == null) {
      openKeypad('capacity', pin.id);
      setError('Set how many tonnes that bin holds, then tap it again.');
      return;
    }
    if (moisture === '') {
      setError('Enter the moisture first.');
      return;
    }
    if (!chaser.scales && quarter == null) {
      setError('Choose how full the chaser is.');
      return;
    }
    if (chaser.scales && !(Number(scaleTonnes) > 0)) {
      setError('Enter the tonnes on the scales.');
      return;
    }
    setBusy(true);
    setSaved(null);
    try {
      const result = await onCommit({
        vehicleId: chaser.id,
        moisture: Number(moisture),
        lines: [{ binId: pin.id, percent: fillPercent, base: 'load' }],
      });
      if (!result.ok) {
        setError(result.error ?? 'Could not record that load.');
        return;
      }
      setError(null);
      setSaved(`${formatTonnes(loadTonnes)} into ${pin.name || 'the bin'} at ${formatMoisture(Number(moisture))}.`);
    } catch {
      setError('Could not record that load.');
    } finally {
      setBusy(false);
    }
  };

  const addChaser = () => {
    const capacityT = Number(newCapacity);
    if (!newName.trim() || !Number.isFinite(capacityT) || capacityT <= 0) return;
    const id = crypto.randomUUID();
    onVehicles([
      ...settings.vehicles,
      { id, kind: 'chaser', name: newName.trim(), capacityT, ...(newScales ? { scales: true } : {}) },
    ]);
    setChaserId(id);
    setNewName('');
    setNewCapacity('');
    setNewScales(false);
    setAdding(false);
  };

  return (
    <div className="relative flex flex-1 min-h-0 h-full flex-col bg-slate-100">
      <header className="flex flex-wrap items-center gap-2 px-3 py-2 bg-white border-b border-slate-200">
        <FieldBinModeSwitch mode="chaser" onChange={onMode} />
        {chaser && (
          <>
            <label className="text-sm text-slate-600">
              Loading into
              <select
                value={chaser.id}
                onChange={(event) => setChaserId(event.target.value)}
                className="ml-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800"
              >
              {chasers.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · {formatTonnes(row.capacityT)}
                </option>
              ))}
              </select>
            </label>
            <button
              type="button"
              disabled={disabled}
              aria-pressed={Boolean(chaser.scales)}
              onClick={() =>
                onVehicles(
                  settings.vehicles.map((row) => {
                    if (row.id !== chaser.id) return row;
                    if (row.scales) {
                      const rest = { ...row };
                      delete rest.scales;
                      return rest;
                    }
                    return { ...row, scales: true };
                  })
                )
              }
              className={`px-3 py-2 rounded-xl text-sm font-semibold ${chaser.scales ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}
            >
              Scales
            </button>
            {chasers.map((row) => {
              const held = vehicleStock[row.id];
              const pendingLoad = row.id === chaser.id && (moisture !== '' || quarter != null || scaleTonnes !== '');
              const empty = (held?.tonnes ?? 0) <= 0 && !pendingLoad;
              return (
                <button
                  key={row.id}
                  type="button"
                  aria-label={`Clear ${row.name}`}
                  disabled={disabled || empty}
                  onClick={() =>
                    setPending({
                      id: row.id,
                      name: row.name,
                      tonnes: held?.tonnes ?? 0,
                      moisture: held?.moisture ?? null,
                      pendingLoad,
                    })
                  }
                  className="px-3 py-2 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-200 disabled:opacity-40"
                >
                  Clear {row.name}
                  {(held?.tonnes ?? 0) > 0 ? ` · ${formatTonnes(held?.tonnes ?? 0)}` : ''}
                </button>
              );
            })}
          </>
        )}
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="px-3 py-2 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-200"
        >
          New profile
        </button>
      </header>

      {(adding || chasers.length === 0) && (
        <div className="m-4 max-w-md space-y-3 rounded-2xl bg-white border border-slate-200 p-4">
          <h2 className="text-lg font-bold text-slate-900">Chaser profile</h2>
          <input
            value={newName}
            placeholder="Name"
            onChange={(event) => setNewName(event.target.value)}
            className="w-full px-3 py-3 border border-slate-200 rounded-xl text-base"
          />
          <input
            value={newCapacity}
            type="number"
            min={0}
            placeholder="Capacity (t)"
            onChange={(event) => setNewCapacity(event.target.value)}
            className="w-full px-3 py-3 border border-slate-200 rounded-xl text-base"
          />
          <button
            type="button"
            aria-pressed={newScales}
            onClick={() => setNewScales((on) => !on)}
            className={`px-3 py-2 rounded-xl text-sm font-semibold ${newScales ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            Has scales
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={addChaser}
            className="w-full py-3 rounded-xl bg-amber-700 text-white font-semibold"
          >
            Save profile
          </button>
          {chasers.length > 0 && (
            <button type="button" onClick={() => setAdding(false)} className="w-full py-2 text-sm font-semibold text-slate-600">
              Cancel
            </button>
          )}
        </div>
      )}

      {chaser && (
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex-1 overflow-auto p-3">
              {bins.length === 0 ? (
                <p className="text-sm text-slate-500">Drop a field bin on the map first.</p>
              ) : (
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                  {bins.map((pin) => {
                    const record = settings.bins[pin.id];
                    const held = stock[pin.id];
                    return (
                      <div key={pin.id} className="min-h-[9rem] rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                        <BinName name={pin.name} disabled={disabled} onRename={(name) => onRename(pin.id, name)} />
                        <button
                          type="button"
                          disabled={disabled || busy}
                          onClick={() => void unload(pin)}
                          className="flex-1 px-3 pb-3 text-left active:bg-amber-50"
                        >
                          <p className="text-sm text-slate-500">
                            {record
                              ? `${formatTonnes(held?.tonnes ?? 0)} · ${formatMoisture(held?.moisture)}`
                              : 'Tap to set capacity'}
                          </p>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => openKeypad('moisture')}
              className="m-3 mt-0 rounded-2xl bg-white border border-slate-200 px-4 py-4 text-left shadow-sm"
            >
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Moisture</span>
              <span className="block text-3xl font-bold text-slate-900 tabular-nums">
                {moisture === '' ? '—' : formatMoisture(Number(moisture))}
              </span>
            </button>
            {(error || saved) && (
              <p className={`mx-3 mb-3 text-sm font-semibold ${error ? 'text-rose-600' : 'text-emerald-700'}`}>
                {error || saved}
              </p>
            )}
          </div>

          <aside className="w-36 sm:w-44 shrink-0 border-l border-slate-200 bg-white p-2 flex flex-col gap-2">
            <div className="flex-1 flex gap-2 min-h-0">
              <div className="w-8 self-stretch rounded-full bg-slate-100 relative overflow-hidden">
                <div className="absolute inset-x-0 bottom-0 bg-amber-600" style={{ height: `${Math.max(0, Math.min(100, fillPercent))}%` }} />
              </div>
              {chaser.scales ? (
                <button
                  type="button"
                  onClick={() => openKeypad('tonnes')}
                  className="flex-1 rounded-2xl bg-amber-700 text-white font-bold text-lg"
                >
                  {scaleTonnes ? `${scaleTonnes} t` : 'Tonnes'}
                </button>
              ) : (
                <div className="flex-1 flex flex-col gap-2">
                  {QUARTERS.map((step) => (
                    <button
                      key={step.label}
                      type="button"
                      aria-pressed={quarter === step.fraction}
                      onClick={() => setQuarter(step.fraction)}
                      className={`flex-1 rounded-2xl text-lg font-bold ${
                        quarter === step.fraction ? 'bg-amber-700 text-white' : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {step.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-center text-sm font-semibold text-slate-600">{loadTonnes > 0 ? formatTonnes(loadTonnes) : '—'}</p>
          </aside>
        </div>
      )}

      {keypad && (
        <FieldBinKeypad
          label={keypad.target === 'moisture' ? 'Moisture %' : keypad.target === 'tonnes' ? 'Tonnes' : 'Bin capacity (t)'}
          value={keypad.draft}
          onChange={(draft) => setKeypad({ ...keypad, draft })}
          onEnter={commitKeypad}
          onClose={() => setKeypad(null)}
        />
      )}
      {pending && (
        <FieldBinClearConfirm
          name={pending.name}
          kind="vehicle"
          tonnes={pending.tonnes}
          moisture={pending.moisture}
          pendingLoad={pending.pendingLoad}
          busy={clearing}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setClearing(true);
            const finish = () => {
              if (pending.id === chaser?.id) {
                setMoisture('');
                setQuarter(null);
                setScaleTonnes('');
              }
              setError(null);
              setPending(null);
              setClearing(false);
            };
            if (pending.tonnes <= 0) {
              finish();
              return;
            }
            void onClearVehicle(pending.id)
              .then((result) => {
                if (!result.ok) {
                  setError(result.error ?? 'Could not clear that chaser.');
                  setClearing(false);
                  return;
                }
                finish();
              })
              .catch(() => {
                setError('Could not clear that chaser.');
                setClearing(false);
              });
          }}
        />
      )}
    </div>
  );
}

function BinName({
  name,
  disabled,
  onRename,
}: {
  name: string;
  disabled: boolean;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          setEditing(false);
          const next = draft.trim();
          if (next && next !== name) onRename(next);
          else setDraft(name);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        className="m-2 px-2 py-1 rounded-lg border border-amber-300 text-lg font-bold text-slate-900"
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        setDraft(name);
        setEditing(true);
      }}
      className="px-3 pt-3 text-left text-lg font-bold text-slate-900"
    >
      {name || 'Field bin'}
    </button>
  );
}
