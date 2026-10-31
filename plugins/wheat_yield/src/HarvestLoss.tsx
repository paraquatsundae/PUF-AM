import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../../src/contexts/AuthContext';
import {
  LOSS_CROPS,
  SPREAD_ZONES,
  TRAYS,
  areaForDrop,
  gramsFromCount,
  lossCrop,
  planHarvestLoss,
  trayChoiceLabel,
  trayKgPerHa,
  type CustomTray,
  type HarvestLossCalculation,
  type LossCropId,
  type LossDrop,
  type SpreadZoneId,
} from './estimateHarvestLoss';
import { HarvestLossSpread } from './HarvestLossSpread';
import { HarvestLossTrayLibrary } from './HarvestLossTrayLibrary';
import { mergeCustomTrays, readCustomTrays, writeCustomTrays } from './harvestLossTrayLibrary';
import { useHarvestLoss } from './useHarvestLoss';

type DropDraft = {
  key: string;
  tray: string;
  areaM2?: number;
  zone: SpreadZoneId;
  mode: 'weight' | 'count';
  amount: string;
};

type CalcDraft = {
  key: string;
  cropId: LossCropId;
  headerM: string;
  spreadM: string;
  spreadFollows: boolean;
  drops: DropDraft[];
};

function blankCalc(): CalcDraft {
  return { key: crypto.randomUUID(), cropId: 'canola', headerM: '', spreadM: '', spreadFollows: true, drops: [] };
}

function blankDrop(zone: SpreadZoneId, tray: string): DropDraft {
  return { key: crypto.randomUUID(), tray, zone, mode: 'weight', amount: '' };
}

function num(raw: string): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function kg(value: number): string {
  return `${value.toLocaleString('en-AU', { maximumFractionDigits: 1 })} kg/ha`;
}

function dropFromDraft(drop: DropDraft, trays: CustomTray[]): LossDrop | null {
  if (drop.amount.trim() === '') return null;
  const areaM2 = areaForDrop({ tray: drop.tray, zone: drop.zone, areaM2: drop.areaM2 }, trays);
  if (areaM2 == null) return null;
  const amount = num(drop.amount);
  const custom = !TRAYS.some((tray) => tray.id === drop.tray);
  if (drop.mode === 'count') {
    return custom ? { tray: drop.tray, zone: drop.zone, grains: amount, areaM2 } : { tray: drop.tray, zone: drop.zone, grains: amount };
  }
  return custom ? { tray: drop.tray, zone: drop.zone, grams: amount, areaM2 } : { tray: drop.tray, zone: drop.zone, grams: amount };
}

function draftsFromRecord(calculations: HarvestLossCalculation[]): CalcDraft[] {
  if (calculations.length === 0) return [blankCalc()];
  return calculations.map((calc) => ({
    key: calc.id,
    cropId: calc.cropId,
    headerM: String(calc.headerM),
    spreadM: String(calc.spreadM),
    spreadFollows: calc.spreadM === calc.headerM,
    drops: calc.drops.map((drop) => ({
      key: crypto.randomUUID(),
      tray: drop.tray,
      areaM2: drop.areaM2,
      zone: drop.zone,
      mode: drop.grains != null ? 'count' : 'weight',
      amount: String(drop.grains ?? drop.grams ?? ''),
    })),
  }));
}

function toSave(calculations: CalcDraft[], trays: CustomTray[]): HarvestLossCalculation[] {
  return calculations
    .map((calc) => {
      const headerM = num(calc.headerM);
      const spreadM = num(calc.spreadM) || headerM;
      const drops = calc.drops.map((drop) => dropFromDraft(drop, trays)).filter((drop): drop is LossDrop => drop != null);
      return { id: calc.key, cropId: calc.cropId, headerM, spreadM, drops };
    })
    .filter((calc) => calc.headerM > 0 && calc.spreadM > 0);
}

/** Weighed drop trays, or a grain count, several drops to one header. */
export function HarvestLoss({ farmId, blockId }: { farmId: string | undefined; blockId: string }) {
  const { user } = useAuth();
  const loss = useHarvestLoss(farmId, blockId || undefined);
  const [calculations, setCalculations] = useState<CalcDraft[]>([blankCalc()]);
  const [trays, setTrays] = useState<CustomTray[]>(() => readCustomTrays(farmId));
  const [placingId, setPlacingId] = useState('square30');
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const appliedKey = useRef('');

  useEffect(() => {
    if (!blockId || loss.loading) return;
    const key = `${blockId}:${loss.record?.updatedAt ?? 'new'}`;
    if (appliedKey.current === key) return;
    appliedKey.current = key;
    setCalculations(draftsFromRecord(loss.record?.calculations ?? []));
    if (loss.record) {
      const merged = mergeCustomTrays(readCustomTrays(farmId), loss.record.trays);
      setTrays(merged);
      writeCustomTrays(farmId, merged);
    } else {
      setTrays(readCustomTrays(farmId));
    }
    setSavedNote(null);
  }, [blockId, farmId, loss.loading, loss.record]);

  const updateCalc = (key: string, patch: Partial<CalcDraft>) => {
    setCalculations((current) => current.map((calc) => (calc.key === key ? { ...calc, ...patch } : calc)));
    setSavedNote(null);
  };

  const setHeader = (calc: CalcDraft, value: string) => {
    updateCalc(calc.key, {
      headerM: value,
      spreadM: calc.spreadFollows ? value : calc.spreadM,
    });
  };

  const addDrop = (calc: CalcDraft, zone: SpreadZoneId) => {
    updateCalc(calc.key, { drops: [...calc.drops, blankDrop(zone, placingId)] });
  };

  const replaceTrays = (next: CustomTray[]) => {
    setTrays(next);
    writeCustomTrays(farmId, next);
    setSavedNote(null);
  };

  const updateDrop = (calc: CalcDraft, dropKey: string, patch: Partial<DropDraft>) => {
    updateCalc(calc.key, {
      drops: calc.drops.map((drop) => (drop.key === dropKey ? { ...drop, ...patch } : drop)),
    });
  };

  const save = async () => {
    if (!user?.uid || !blockId) return;
    const ok = await loss.save(user.uid, toSave(calculations, trays), trays);
    setSavedNote(ok ? 'Saved for this paddock.' : null);
  };

  return (
    <div className="space-y-4">
      <HarvestLossTrayLibrary trays={trays} selectedId={placingId} onSelect={setPlacingId} onTrays={replaceTrays} />
      {calculations.map((calc, index) => {
        const crop = lossCrop(calc.cropId);
        const drops = calc.drops.map((drop) => dropFromDraft(drop, trays)).filter((drop): drop is LossDrop => drop != null);
        const planned = planHarvestLoss({
          headerM: num(calc.headerM),
          spreadM: num(calc.spreadM) || num(calc.headerM),
          grainsPerGram: crop?.grainsPerGram ?? 0,
          drops,
          trays,
        });
        return (
          <section key={calc.key} className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 space-y-4 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-800">Calculation {index + 1}</h2>
              {calculations.length > 1 && (
                <button
                  type="button"
                  className="text-sm font-semibold text-slate-500"
                  onClick={() => setCalculations((current) => current.filter((row) => row.key !== calc.key))}
                >
                  Remove
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {LOSS_CROPS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={calc.cropId === option.id}
                  onClick={() => updateCalc(calc.key, { cropId: option.id })}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold ${
                    calc.cropId === option.id ? 'bg-amber-700 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              {crop ? `${crop.grainsPerGram} grains per gram when a drop is counted instead of weighed.` : ''}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-slate-500">
                Header width (m)
                <input
                  inputMode="decimal"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900"
                  value={calc.headerM}
                  placeholder="12"
                  onChange={(event) => setHeader(calc, event.target.value)}
                />
              </label>
              <label className="block text-xs text-slate-500">
                Spread width (m)
                <input
                  inputMode="decimal"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900"
                  value={calc.spreadM}
                  placeholder="Same as header"
                  onChange={(event) => updateCalc(calc.key, { spreadM: event.target.value, spreadFollows: false })}
                />
              </label>
            </div>
            <HarvestLossSpread
              headerM={num(calc.headerM)}
              spreadM={num(calc.spreadM) || num(calc.headerM)}
              drops={calc.drops}
              bands={planned.ok === true ? planned.bands : []}
              onAdd={(zone) => addDrop(calc, zone)}
            />
            <div className="space-y-2">
              {calc.drops.map((drop, dropIndex) => {
                const saved = dropFromDraft(drop, trays);
                const cropGrams =
                  saved?.grains != null && crop ? gramsFromCount(saved.grains, crop.grainsPerGram) : saved?.grams;
                const each = saved && cropGrams != null ? trayKgPerHa(cropGrams, areaForDrop(saved, trays) ?? 0) : null;
                const zoneLabel = SPREAD_ZONES.find((zone) => zone.id === drop.zone)?.label ?? 'Band';
                return (
                  <div key={drop.key} className="rounded-xl border border-slate-200 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">
                        Drop {dropIndex + 1} · {zoneLabel} · {trayChoiceLabel(drop.tray, trays)}
                      </p>
                      <button
                        type="button"
                        className="p-2 text-slate-400"
                        aria-label={`Remove drop ${dropIndex + 1}`}
                        onClick={() =>
                          updateCalc(calc.key, { drops: calc.drops.filter((row) => row.key !== drop.key) })
                        }
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <label className="block text-xs text-slate-500">
                      Tray dropped
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900"
                        value={drop.tray}
                        onChange={(event) => updateDrop(calc, drop.key, { tray: event.target.value, areaM2: undefined })}
                      >
                        {TRAYS.map((tray) => (
                          <option key={tray.id} value={tray.id}>
                            {tray.label}
                          </option>
                        ))}
                        {trays.map((tray) => (
                          <option key={tray.id} value={tray.id}>
                            {tray.label}
                          </option>
                        ))}
                        {!TRAYS.some((tray) => tray.id === drop.tray) && !trays.some((tray) => tray.id === drop.tray) ? (
                          <option value={drop.tray}>{trayChoiceLabel(drop.tray, trays)}</option>
                        ) : null}
                      </select>
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {SPREAD_ZONES.map((zone) => (
                        <button
                          key={zone.id}
                          type="button"
                          aria-pressed={drop.zone === zone.id}
                          onClick={() => updateDrop(calc, drop.key, { zone: zone.id })}
                          className={`px-2 py-1 rounded-lg text-xs font-semibold ${
                            drop.zone === zone.id ? 'bg-amber-700 text-white' : 'bg-amber-50 text-slate-700'
                          }`}
                        >
                          {zone.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex rounded-lg bg-slate-100 p-0.5 w-fit">
                      <button
                        type="button"
                        aria-pressed={drop.mode === 'weight'}
                        onClick={() => updateDrop(calc, drop.key, { mode: 'weight', amount: '' })}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold ${drop.mode === 'weight' ? 'bg-white shadow-sm' : 'text-slate-600'}`}
                      >
                        Weigh
                      </button>
                      <button
                        type="button"
                        aria-pressed={drop.mode === 'count'}
                        onClick={() => updateDrop(calc, drop.key, { mode: 'count', amount: '' })}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold ${drop.mode === 'count' ? 'bg-white shadow-sm' : 'text-slate-600'}`}
                      >
                        Count grains
                      </button>
                    </div>
                    <label className="block text-xs text-slate-500">
                      {drop.mode === 'weight' ? 'Grain in the tray (g)' : 'Grains in the tray'}
                      <input
                        inputMode="decimal"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900"
                        value={drop.amount}
                        onChange={(event) => updateDrop(calc, drop.key, { amount: event.target.value })}
                      />
                    </label>
                    {each != null && <p className="text-xs text-slate-600">This tray {kg(each)} on the ground</p>}
                  </div>
                );
              })}
              <button
                type="button"
                className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"
                onClick={() => addDrop(calc, 'c')}
              >
                <Plus className="w-4 h-4" /> Add drop
              </button>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-sm text-slate-800 space-y-1">
              {planned.ok === true ? (
                <>
                  <p className="font-semibold">{kg(planned.kgPerHa)} across the cut</p>
                  <p className="text-xs text-slate-500">
                    {`${planned.dropCount} ${planned.dropCount === 1 ? 'drop' : 'drops'} · ${planned.bandsUsed} of ${planned.bandCount} bands · ${kg(planned.groundKgPerHa)} under the spread, scaled by spread ÷ header`}
                  </p>
                </>
              ) : (
                <p className="text-slate-600">{planned.error}</p>
              )}
            </div>
          </section>
        );
      })}
      <button
        type="button"
        className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700"
        onClick={() => setCalculations((current) => [...current, blankCalc()])}
      >
        <Plus className="w-4 h-4" /> Add calculation
      </button>
      {loss.error ? <p className="text-sm text-rose-600">{loss.error}</p> : null}
      {savedNote ? <p className="text-sm text-emerald-700">{savedNote}</p> : null}
      <button
        type="button"
        disabled={!user?.uid || loss.saving || !blockId}
        onClick={() => void save()}
        className="rounded-lg bg-emerald-700 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {loss.saving ? 'Saving…' : 'Save harvest loss'}
      </button>
    </div>
  );
}
