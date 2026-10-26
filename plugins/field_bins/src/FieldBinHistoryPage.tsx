import { useMemo, useState } from 'react';
import { fieldBinDayKey, loadsForBins, summarizeFieldBinHistory } from '../../../shared/farm/fieldBinHistory';
import {
  capacityChangeError,
  levelChangeError,
  moistureChangeError,
  formatMoisture,
  formatTonnes,
  type FieldBinMovement,
  type FieldBinSettings,
} from '../../../shared/farm/fieldBinStock';
import { findBlockIdAtPoint } from '../../../src/lib/farmMapHit';
import type { InfrastructurePin, OrchardBlock } from '../../../src/lib/mapStore';
import { FieldBinClearConfirm } from './FieldBinClearConfirm';
import { FieldBinKeypad } from './FieldBinKeypad';
import { FieldBinModeSwitch, type FieldBinMode } from './FieldBinModeSwitch';
import { FieldBinSilo } from './FieldBinSilo';

type HistoryPick = { kind: 'bin'; id: string } | { kind: 'paddock'; id: string | null };

function dayLabel(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return day;
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function loadTime(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
}

/** Bin status, paddock totals, and the in/out history grouped by day. */
export function FieldBinHistoryPage({
  pins,
  blocks,
  settings,
  stock,
  movements,
  disabled,
  onMode,
  onClearBin,
  onSaveCapacity,
  onSetLevel,
  onSetMoisture,
}: {
  pins: InfrastructurePin[];
  blocks: OrchardBlock[];
  settings: FieldBinSettings;
  stock: Record<string, { tonnes: number; moisture: number | null }>;
  movements: FieldBinMovement[];
  disabled: boolean;
  onMode: (mode: FieldBinMode) => void;
  onClearBin: (binId: string) => Promise<{ ok: boolean; error?: string }>;
  onSaveCapacity: (binId: string, capacityT: number) => void;
  onSetLevel: (binId: string, tonnes: number) => Promise<{ ok: boolean; error?: string }>;
  onSetMoisture: (binId: string, moisture: number) => Promise<{ ok: boolean; error?: string }>;
}) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [pick, setPick] = useState<HistoryPick | null>(null);
  const [pending, setPending] = useState<{ id: string; name: string; tonnes: number; moisture: number | null } | null>(null);
  const [capacityEdit, setCapacityEdit] = useState<{ id: string; draft: string } | null>(null);
  const [levelEdit, setLevelEdit] = useState<{ id: string; draft: string } | null>(null);
  const [moistureEdit, setMoistureEdit] = useState<{ id: string; draft: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bins = useMemo(() => pins.filter((pin) => pin.type === 'field_bin'), [pins]);
  const binPaddock = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const pin of bins) map[pin.id] = findBlockIdAtPoint(blocks, pin.lat, pin.lng);
    return map;
  }, [bins, blocks]);
  const summary = useMemo(
    () => summarizeFieldBinHistory({ movements, stock, binPaddock, timeZone }),
    [binPaddock, movements, stock, timeZone]
  );
  const selectedIds = useMemo(() => {
    if (!pick) return new Set<string>();
    if (pick.kind === 'bin') return new Set([pick.id]);
    return new Set(bins.filter((pin) => (binPaddock[pin.id] ?? null) === pick.id).map((pin) => pin.id));
  }, [binPaddock, bins, pick]);
  const loads = useMemo(() => loadsForBins(movements, selectedIds), [movements, selectedIds]);
  const history = useMemo(
    () =>
      summarizeFieldBinHistory({
        movements: loads.map((load) => load.movement),
        stock,
        binPaddock,
        timeZone,
      }),
    [binPaddock, loads, stock, timeZone]
  );
  const byDay = useMemo(() => {
    const groups = new Map<string, typeof loads>();
    for (const load of loads) {
      const day = fieldBinDayKey(load.movement.at, timeZone);
      if (!day) continue;
      const rows = groups.get(day) ?? [];
      rows.push(load);
      groups.set(day, rows);
    }
    return groups;
  }, [loads, timeZone]);
  const paddockName = (id: string | null) =>
    (id && blocks.find((block) => block.id === id)?.name) || 'No paddock';
  const binName = (id: string) => bins.find((pin) => pin.id === id)?.name || 'Field bin';
  const vehicleName = (id: string) => settings.vehicles.find((row) => row.id === id)?.name || 'Vehicle';
  const commitCapacity = () => {
    if (!capacityEdit) return;
    if (capacityEdit.draft.trim() === '') {
      setCapacityEdit(null);
      return;
    }
    const figure = Number(capacityEdit.draft);
    const problem = capacityChangeError(stock[capacityEdit.id]?.tonnes ?? 0, figure);
    if (problem) {
      setError(problem);
      return;
    }
    onSaveCapacity(capacityEdit.id, figure);
    setError(null);
    setCapacityEdit(null);
  };
  const writeLevel = (binId: string, figure: number) => {
    const problem = levelChangeError(settings.bins[binId]?.capacityT ?? null, figure);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    void onSetLevel(binId, figure)
      .then((result) => {
        if (!result.ok) {
          setError(result.error ?? 'Could not set that level.');
          return;
        }
        setError(null);
        setLevelEdit(null);
      })
      .catch(() => setError('Could not set that level.'))
      .finally(() => setBusy(false));
  };
  const commitLevel = () => {
    if (!levelEdit) return;
    if (levelEdit.draft.trim() === '') {
      setLevelEdit(null);
      return;
    }
    writeLevel(levelEdit.id, Number(levelEdit.draft));
  };
  const fillToCapacity = () => {
    if (!levelEdit || busy) return;
    const capacity = settings.bins[levelEdit.id]?.capacityT;
    if (!capacity) {
      setError('Set a capacity before filling this bin.');
      return;
    }
    writeLevel(levelEdit.id, capacity);
  };
  const commitMoisture = () => {
    if (!moistureEdit || busy) return;
    if (moistureEdit.draft.trim() === '') {
      setMoistureEdit(null);
      return;
    }
    const figure = Number(moistureEdit.draft);
    const problem = moistureChangeError(stock[moistureEdit.id]?.tonnes ?? 0, figure);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    void onSetMoisture(moistureEdit.id, figure)
      .then((result) => {
        if (!result.ok) {
          setError(result.error ?? 'Could not set that moisture.');
          return;
        }
        setError(null);
        setMoistureEdit(null);
      })
      .catch(() => setError('Could not set that moisture.'))
      .finally(() => setBusy(false));
  };

  return (
    <div className="relative flex flex-1 min-h-0 flex-col bg-slate-100">
      <header className="flex items-center gap-2 px-3 py-2 bg-white border-b border-slate-200">
        <FieldBinModeSwitch mode="bins" onChange={onMode} />
      </header>
      <div className="flex-1 overflow-auto p-4 max-w-3xl space-y-6">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-800">Bins</h2>
          {bins.length === 0 ? (
            <p className="text-sm text-slate-500">Drop a field bin on the map first.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {bins.map((pin) => {
                const record = settings.bins[pin.id];
                const held = stock[pin.id];
                return (
                  <li key={pin.id}>
                    <FieldBinSilo
                      name={pin.name || 'Field bin'}
                      tonnes={held?.tonnes ?? 0}
                      capacityT={record?.capacityT ?? null}
                      moisture={held?.moisture ?? null}
                      paddock={paddockName(binPaddock[pin.id] ?? null)}
                      selected={pick?.kind === 'bin' && pick.id === pin.id}
                      disabled={disabled}
                      onSelect={() =>
                        setPick((current) =>
                          current?.kind === 'bin' && current.id === pin.id ? null : { kind: 'bin', id: pin.id }
                        )
                      }
                      onAskLevel={() => {
                        setError(null);
                        setCapacityEdit(null);
                        setMoistureEdit(null);
                        setLevelEdit({ id: pin.id, draft: '' });
                      }}
                      onAskCapacity={() => {
                        setError(null);
                        setLevelEdit(null);
                        setMoistureEdit(null);
                        setCapacityEdit({ id: pin.id, draft: '' });
                      }}
                      onAskMoisture={() => {
                        setError(null);
                        setLevelEdit(null);
                        setCapacityEdit(null);
                        setMoistureEdit({ id: pin.id, draft: '' });
                      }}
                      onAskClear={() =>
                        setPending({
                          id: pin.id,
                          name: pin.name || 'Field bin',
                          tonnes: held?.tonnes ?? 0,
                          moisture: held?.moisture ?? null,
                        })
                      }
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-800">Paddocks</h2>
          {summary.paddocks.length === 0 ? (
            <p className="text-sm text-slate-500">No grain recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {summary.paddocks.map((row) => (
                <li key={row.paddockId ?? 'none'}>
                  <button
                    type="button"
                    aria-pressed={pick?.kind === 'paddock' && pick.id === row.paddockId}
                    onClick={() =>
                      setPick((current) =>
                        current?.kind === 'paddock' && current.id === row.paddockId
                          ? null
                          : { kind: 'paddock', id: row.paddockId }
                      )
                    }
                    className={`w-full rounded-xl border px-3 py-3 text-left ${
                      pick?.kind === 'paddock' && pick.id === row.paddockId
                        ? 'border-amber-700 bg-white ring-2 ring-amber-700'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <p className="font-bold text-slate-900">{paddockName(row.paddockId)}</p>
                    <p className="text-xs text-slate-500">{row.binIds.map(binName).join(', ')}</p>
                    <p className="mt-1 text-sm text-slate-700">
                      Holding {formatTonnes(row.holdingT)} · in {formatTonnes(row.inT)} · out {formatTonnes(row.outT)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">
            History
            {pick?.kind === 'bin' ? ` · ${binName(pick.id)}` : ''}
            {pick?.kind === 'paddock' ? ` · ${paddockName(pick.id)}` : ''}
          </h2>
          {!pick ? (
            <p className="text-sm text-slate-500">Select a bin or a paddock to see its loads.</p>
          ) : history.days.length === 0 ? (
            <p className="text-sm text-slate-500">No loads for this selection yet.</p>
          ) : (
            history.days.map((day) => (
              <div key={day.day} className="space-y-2">
                <p className="text-sm font-semibold text-slate-800">
                  {dayLabel(day.day)} · in {formatTonnes(day.inT)} · out {formatTonnes(day.outT)} · {day.loads}{' '}
                  {day.loads === 1 ? 'load' : 'loads'}
                </p>
                <ul className="space-y-2">
                  {(byDay.get(day.day) ?? []).map((load) => {
                    const { movement } = load;
                    const tonnes = movement.lines.reduce((sum, line) => sum + line.tonnes, 0);
                    const moist = movement.direction === 'in' ? movement.moisture : movement.mixMoisture;
                    return (
                      <li key={movement.id} className="rounded-xl bg-white border border-slate-200 px-3 py-3">
                        <p className="font-semibold text-slate-900">
                          {loadTime(movement.at)} ·{' '}
                          {movement.setMoisture
                            ? 'Moisture'
                            : movement.setLevel
                              ? 'Set'
                              : movement.clear === 'bin'
                              ? 'Cleared'
                              : `${movement.direction === 'in' ? 'In' : 'Out'} · ${vehicleName(movement.vehicleId)}`}
                        </p>
                        <p className="text-sm text-slate-700">
                          {movement.setMoisture
                            ? formatMoisture(movement.moisture)
                            : `${formatTonnes(tonnes)}${moist != null ? ` · ${formatMoisture(moist)}` : ''}`}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {movement.lines.map((line) => `${binName(line.binId)} ${formatTonnes(line.tonnes)}`).join(' · ')}
                        </p>
                        {load.alsoBinIds.length > 0 && (
                          <p className="text-xs text-slate-500 mt-0.5">With {load.alsoBinIds.map(binName).join(', ')}</p>
                        )}
                        {movement.note && <p className="text-xs text-slate-500 mt-1">{movement.note}</p>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </section>
        {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}
      </div>
      {levelEdit && (
        <FieldBinKeypad
          label="Filled (t)"
          value={levelEdit.draft}
          error={error}
          onFull={fillToCapacity}
          onChange={(draft) => setLevelEdit({ ...levelEdit, draft })}
          onEnter={commitLevel}
          onClose={() => {
            setLevelEdit(null);
            setError(null);
          }}
        />
      )}
      {moistureEdit && (
        <FieldBinKeypad
          label="Moisture %"
          value={moistureEdit.draft}
          error={error}
          onChange={(draft) => setMoistureEdit({ ...moistureEdit, draft })}
          onEnter={commitMoisture}
          onClose={() => {
            setMoistureEdit(null);
            setError(null);
          }}
        />
      )}
      {capacityEdit && (
        <FieldBinKeypad
          label="Capacity (t)"
          value={capacityEdit.draft}
          error={error}
          onChange={(draft) => setCapacityEdit({ ...capacityEdit, draft })}
          onEnter={commitCapacity}
          onClose={() => {
            setCapacityEdit(null);
            setError(null);
          }}
        />
      )}
      {pending && (
        <FieldBinClearConfirm
          name={pending.name}
          kind="bin"
          tonnes={pending.tonnes}
          moisture={pending.moisture}
          pendingLoad={false}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setBusy(true);
            void onClearBin(pending.id)
              .then((result) => {
                if (!result.ok) {
                  setError(result.error ?? 'Could not clear that bin.');
                  return;
                }
                setError(null);
                setPending(null);
              })
              .catch(() => setError('Could not clear that bin.'))
              .finally(() => setBusy(false));
          }}
        />
      )}
    </div>
  );
}
