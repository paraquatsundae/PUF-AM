import { useEffect, useMemo, useState } from 'react';
import {
  formatMoisture,
  formatTonnes,
  planTruckLoad,
  truckColorId,
  type FieldBinReceival,
  type FieldBinSettings,
  type FieldBinTrailer,
  type FieldBinVehicle,
  type TruckFill,
} from '../../../shared/farm/fieldBinStock';
import { fieldBinPlaces } from '../../../shared/farm/fieldBinPlace';
import type { InfrastructurePin } from '../../../src/lib/mapStore';
import { FieldBinBlendCard } from './FieldBinBlendCard';
import { FieldBinClearConfirm } from './FieldBinClearConfirm';
import { FieldBinKeypad } from './FieldBinKeypad';
import { FieldBinModeSwitch, type FieldBinMode } from './FieldBinModeSwitch';
import { FieldBinTruckMark } from './FieldBinTruckMark';
import { FieldBinTruckProfile } from './FieldBinTruckProfile';

type FillDraft = { key: string; trailerId: string; binId: string; percent: string };

function savedTrailers(truck: FieldBinVehicle): FieldBinTrailer[] {
  if (truck.trailers?.length) return truck.trailers;
  return [{ id: truck.id, capacityT: truck.capacityT }];
}

/** Pick a saved truck profile, then say which bins fill each trailer. */
export function FieldBinTruckPage({
  pins,
  settings,
  stock,
  vehicleStock,
  disabled,
  onMode,
  onSaveTruck,
  onRemoveTruck,
  onSaveReceival,
  onCommit,
  onClearVehicle,
}: {
  pins: InfrastructurePin[];
  settings: FieldBinSettings;
  stock: Record<string, { tonnes: number; moisture: number | null }>;
  vehicleStock: Record<string, { tonnes: number; moisture: number | null }>;
  disabled: boolean;
  onMode: (mode: FieldBinMode) => void;
  onSaveTruck: (truck: FieldBinVehicle) => void;
  onRemoveTruck: (id: string) => void;
  onSaveReceival: (receival: FieldBinReceival) => void;
  onCommit: (draft: {
    vehicleId: string;
    trailers: FieldBinTrailer[];
    fills: TruckFill[];
  }) => Promise<{ ok: boolean; error?: string }>;
  onClearVehicle: (vehicleId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const trucks = settings.vehicles.filter((row) => row.kind === 'truck');
  const bins = fieldBinPlaces(pins, settings);
  const [truckId, setTruckId] = useState(trucks[0]?.id ?? '');
  const [profile, setProfile] = useState<FieldBinVehicle | null | 'closed'>('closed');
  const [fills, setFills] = useState<FillDraft[]>([]);
  const [preview, setPreview] = useState<TruckFill[]>([]);
  const [keypad, setKeypad] = useState<{ fillKey: string; draft: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    id: string;
    name: string;
    tonnes: number;
    moisture: number | null;
    pendingLoad: boolean;
  } | null>(null);
  const [clearing, setClearing] = useState(false);
  const truck = trucks.find((row) => row.id === truckId) ?? trucks[0];
  const editing = profile !== 'closed' ? profile : null;
  const colorIndex = editing ? Math.max(0, trucks.findIndex((row) => row.id === editing.id)) : trucks.length;
  const trailers = truck ? savedTrailers(truck) : [];
  const trailerKey = trailers.map((trailer) => `${trailer.id}:${trailer.capacityT}`).join('|');

  useEffect(() => {
    setFills([]);
    setKeypad(null);
  }, [truck?.id, trailerKey]);

  const openPercent = (fillKey: string) => setKeypad({ fillKey, draft: '' });

  const commitPercent = () => {
    if (!keypad) return;
    if (keypad.draft.trim() === '') {
      setKeypad(null);
      return;
    }
    const figure = Number(keypad.draft);
    if (!Number.isFinite(figure) || figure <= 0 || figure > 100) {
      setError('Percent has to be greater than 0 and at most 100.');
      return;
    }
    setFills((rows) => rows.map((row) => (row.key === keypad.fillKey ? { ...row, percent: keypad.draft } : row)));
    setError(null);
    setKeypad(null);
  };

  const planned = useMemo(() => {
    const ready = fills.filter((fill) => fill.binId && Number(fill.percent) > 0);
    if (!truck || ready.length === 0) return null;
    return planTruckLoad({
      trailers,
      fills: ready.map((fill) => ({ trailerId: fill.trailerId, binId: fill.binId, percent: Number(fill.percent) })),
      bins: Object.fromEntries(
        bins.map((pin) => {
          const record = settings.bins[pin.id];
          const held = stock[pin.id];
          return [pin.id, { tonnes: held?.tonnes ?? 0, capacityT: record?.capacityT ?? 0, moisture: held?.moisture ?? null }];
        })
      ),
    });
  }, [bins, fills, settings.bins, stock, trailers, truck]);

  const manualLoad = fills.filter((fill) => fill.binId && Number(fill.percent) > 0);
  const shownLoad =
    manualLoad.length > 0
      ? manualLoad.map((fill) => ({
          trailerId: fill.trailerId,
          binId: fill.binId,
          percent: Math.round(Number(fill.percent)),
        }))
      : preview;
  const binKey = bins.map((pin) => ({ id: pin.id, name: pin.name || 'Field bin' }));

  const useBlend = (next: TruckFill[]) => {
    setFills(
      next.map((fill) => ({
        key: crypto.randomUUID(),
        trailerId: fill.trailerId,
        binId: fill.binId,
        percent: String(Math.round(fill.percent)),
      }))
    );
    setKeypad(null);
    setError(null);
    setSaved('Blend copied onto the trailers.');
  };

  const loadSummary =
    !truck
      ? 'Save a truck profile, then choose it to load.'
      : planned == null
        ? 'Choose a bin and a percent on a trailer to calculate the load.'
        : planned.ok === false
          ? planned.error
          : `${formatTonnes(planned.lines.reduce((sum, line) => sum + line.tonnes, 0))} · moisture ${formatMoisture(planned.mixMoisture)}`;

  const record = async () => {
    if (!truck || planned == null) return;
    if (planned.ok === false) {
      setError(planned.error);
      return;
    }
    const result = await onCommit({
      vehicleId: truck.id,
      trailers,
      fills: fills
        .filter((fill) => fill.binId && Number(fill.percent) > 0)
        .map((fill) => ({ trailerId: fill.trailerId, binId: fill.binId, percent: Number(fill.percent) })),
    });
    if (!result.ok) {
      setError(result.error ?? 'Could not record that load.');
      return;
    }
    setError(null);
    setSaved(`${truck.name}: ${formatTonnes(planned.lines.reduce((sum, line) => sum + line.tonnes, 0))} at ${formatMoisture(planned.mixMoisture)}.`);
    setFills([]);
  };

  return (
    <div className="relative flex flex-1 min-h-0 flex-col bg-slate-100">
      <header className="flex flex-wrap items-center gap-2 px-3 py-2 bg-white border-b border-slate-200">
        <FieldBinModeSwitch mode="truck" onChange={onMode} />
        <button
          type="button"
          onClick={() => setProfile(null)}
          className="px-3 py-2 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-200"
        >
          New profile
        </button>
        {truck && (
          <button
            type="button"
            onClick={() => setProfile(truck)}
            className="px-3 py-2 rounded-xl text-sm font-semibold text-slate-700"
          >
            Edit profile
          </button>
        )}
      </header>
      <div className="flex-1 overflow-auto p-4 max-w-3xl space-y-4">
        {trucks.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {trucks.map((row, index) => (
              <FieldBinTruckMark
                key={row.id}
                truck={row}
                index={index}
                selected={row.id === truck?.id}
                held={vehicleStock[row.id]}
                clearDisabled={disabled || ((vehicleStock[row.id]?.tonnes ?? 0) <= 0 && !(row.id === truck?.id && fills.length > 0))}
                onSelect={() => setTruckId(row.id)}
                onAskClear={() =>
                  setPending({
                    id: row.id,
                    name: row.name,
                    tonnes: vehicleStock[row.id]?.tonnes ?? 0,
                    moisture: vehicleStock[row.id]?.moisture ?? null,
                    pendingLoad: row.id === truck?.id && fills.length > 0,
                  })
                }
                load={row.id === truck?.id ? shownLoad : undefined}
                bins={row.id === truck?.id ? binKey : undefined}
              />
            ))}
          </div>
        )}
        {(profile !== 'closed' || trucks.length === 0) && (
          <FieldBinTruckProfile
            key={profile && profile !== 'closed' ? profile.id : 'new'}
            truck={profile && profile !== 'closed' ? profile : null}
            colorDefault={truckColorId(editing?.color, colorIndex)}
            disabled={disabled}
            onCancel={trucks.length > 0 ? () => setProfile('closed') : undefined}
            onRemove={(id) => {
              onRemoveTruck(id);
              if (truckId === id) setTruckId(trucks.find((row) => row.id !== id)?.id ?? '');
              setProfile('closed');
            }}
            onSave={(next) => {
              onSaveTruck(next);
              setTruckId(next.id);
              setProfile('closed');
              setSaved(`Saved ${next.name}.`);
              setError(null);
            }}
          />
        )}

        {truck && (
          <FieldBinBlendCard
            bins={bins.map((pin) => {
              const record = settings.bins[pin.id];
              const held = stock[pin.id];
              return {
                id: pin.id,
                name: pin.name || 'Field bin',
                tonnes: held?.tonnes ?? 0,
                moisture: held?.moisture ?? null,
                capacityT: record?.capacityT ?? 0,
              };
            })}
            trailers={trailers}
            receival={settings.receival}
            disabled={disabled}
            onReceival={onSaveReceival}
            onUse={useBlend}
            onPreview={setPreview}
          />
        )}

        {truck &&
          trailers.map((trailer, index) => (
            <section key={trailer.id} className="rounded-xl bg-white border border-slate-200 p-3 space-y-2">
              <p className="text-sm font-semibold text-slate-800">
                Trailer {index + 1} · {formatTonnes(trailer.capacityT)}
              </p>
              {bins.length === 0 && <p className="text-sm text-slate-500">Drop a field bin on the map first.</p>}
              <div className="grid grid-cols-2 gap-2">
                {bins.map((pin) => {
                  const fill = fills.find((row) => row.trailerId === trailer.id && row.binId === pin.id);
                  const held = stock[pin.id];
                  return (
                    <div key={pin.id} className="space-y-2">
                      <button
                        type="button"
                        aria-pressed={Boolean(fill)}
                        onClick={() => {
                          if (fill) {
                            setFills((rows) => rows.filter((row) => row.key !== fill.key));
                            if (keypad?.fillKey === fill.key) setKeypad(null);
                            return;
                          }
                          const key = crypto.randomUUID();
                          setFills((rows) => [...rows, { key, trailerId: trailer.id, binId: pin.id, percent: '' }]);
                          openPercent(key);
                        }}
                        className={`w-full min-h-16 px-3 py-3 rounded-xl text-left ${
                          fill ? 'bg-amber-700 text-white' : 'bg-slate-100 text-slate-900'
                        }`}
                      >
                        <span className="block text-base font-bold">{pin.name || 'Field bin'}</span>
                        <span className={`block text-xs ${fill ? 'text-amber-100' : 'text-slate-500'}`}>
                          {formatTonnes(held?.tonnes ?? 0)} · {formatMoisture(held?.moisture)}
                        </span>
                      </button>
                      {fill && (
                        <button
                          type="button"
                          onClick={() => openPercent(fill.key)}
                          className="w-full rounded-xl bg-white border border-slate-200 px-3 py-3 text-left"
                        >
                          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                            % of this trailer
                          </span>
                          <span className="block text-3xl font-bold text-slate-900 tabular-nums">
                            {fill.percent === '' ? '—' : String(Math.round(Number(fill.percent)))}
                          </span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

        <p className="text-sm text-slate-700">{loadSummary}</p>
        {(error || saved) && <p className={`text-sm ${error ? 'text-rose-600' : 'text-emerald-700'}`}>{error || saved}</p>}
        <button
          type="button"
          disabled={disabled || !truck || planned == null || planned.ok === false}
          onClick={() => void record()}
          className="px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-semibold disabled:opacity-40"
        >
          Record load
        </button>
      </div>
      {keypad && (
        <FieldBinKeypad
          label="% of this trailer"
          value={keypad.draft}
          onChange={(draft) => setKeypad({ ...keypad, draft })}
          onEnter={commitPercent}
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
              if (pending.id === truck?.id) setFills([]);
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
                  setError(result.error ?? 'Could not clear that truck.');
                  setClearing(false);
                  return;
                }
                finish();
              })
              .catch(() => {
                setError('Could not clear that truck.');
                setClearing(false);
              });
          }}
        />
      )}
    </div>
  );
}
