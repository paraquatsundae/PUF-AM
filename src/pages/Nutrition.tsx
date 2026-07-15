import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Beaker, CheckCircle2, ChevronRight, Activity } from 'lucide-react';
import { useFarmDiary, NutritionMethod, NutritionRateUnit } from '../lib/farmDiary';
import { useMapStore } from '../lib/mapStore';
import { cn } from '../lib/utils';

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

const PRODUCT_SUGGESTIONS = [
  'UAN-32',
  'Urea',
  'MAP',
  'SOA',
  'Potassium sulphate',
  'KTS',
  'CAN-17',
  'Gypsum',
  'Lime',
  'Foliar mix',
];

export function Nutrition() {
  const { events, addEvent } = useFarmDiary();
  const { blocks } = useMapStore();

  const [blockId, setBlockId] = useState('');
  const [eventDate, setEventDate] = useState(todayIso);
  const [productName, setProductName] = useState('');
  const [rate, setRate] = useState<number>(0);
  const [rateUnit, setRateUnit] = useState<NutritionRateUnit>('kg/ha');
  const [nutritionMethod, setNutritionMethod] = useState<NutritionMethod>('broadcast');
  const [nRate, setNRate] = useState('');
  const [pRate, setPRate] = useState('');
  const [kRate, setKRate] = useState('');
  const [notes, setNotes] = useState('');
  const [loggedFlash, setLoggedFlash] = useState(false);

  useEffect(() => {
    if (!blockId && blocks.length > 0) {
      setBlockId(blocks[0].id);
    }
  }, [blocks, blockId]);

  const recentNutrition = useMemo(
    () => events.filter((e) => e.type === 'nutrition').slice(0, 12),
    [events]
  );

  const fieldClass =
    'bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-400';

  const handleLog = () => {
    if (!productName.trim()) {
      alert('Enter a product name.');
      return;
    }

    const parseOptional = (v: string) => {
      if (v.trim() === '') return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };

    addEvent({
      date: eventDate || todayIso(),
      type: 'nutrition',
      status: 'done',
      blockId: blockId || undefined,
      productName: productName.trim(),
      rate: rate > 0 ? rate : undefined,
      rateUnit,
      nutritionMethod,
      nRate: parseOptional(nRate),
      pRate: parseOptional(pRate),
      kRate: parseOptional(kRate),
      notes: notes.trim() || undefined,
    });

    setLoggedFlash(true);
    window.setTimeout(() => setLoggedFlash(false), 2000);
    setProductName('');
    setRate(0);
    setNRate('');
    setPRate('');
    setKRate('');
    setNotes('');
  };

  const npkSummary = (e: {
    nRate?: number;
    pRate?: number;
    kRate?: number;
  }) => {
    const parts: string[] = [];
    if (e.nRate != null) parts.push(`N ${e.nRate}`);
    if (e.pRate != null) parts.push(`P ${e.pRate}`);
    if (e.kRate != null) parts.push(`K ${e.kRate}`);
    return parts.length ? `${parts.join(' · ')} kg/ha` : '—';
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4 pb-24 lg:pb-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Nutrition</h1>
        <p className="text-sm text-slate-500 mt-0.5">Log what was applied. Soil lab imports come later.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Log application</h2>
            <p className="text-[11px] text-slate-500">Writes to Farm Diary</p>
          </div>
          <Link
            to="/diary"
            className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1"
          >
            Diary <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <label className="flex flex-col gap-0.5 col-span-2 sm:col-span-1">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Block</span>
            <select className={fieldClass} value={blockId} onChange={(e) => setBlockId(e.target.value)}>
              {blocks.length === 0 && <option value="">No blocks mapped</option>}
              {blocks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Date</span>
            <input
              type="date"
              className={fieldClass}
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Method</span>
            <select
              className={fieldClass}
              value={nutritionMethod}
              onChange={(e) => setNutritionMethod(e.target.value as NutritionMethod)}
            >
              <option value="broadcast">Broadcast</option>
              <option value="fertigation">Fertigation</option>
              <option value="foliar">Foliar</option>
              <option value="banding">Banding</option>
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Unit</span>
            <select
              className={fieldClass}
              value={rateUnit}
              onChange={(e) => setRateUnit(e.target.value as NutritionRateUnit)}
            >
              <option value="kg/ha">kg/ha</option>
              <option value="L/ha">L/ha</option>
              <option value="kg">kg</option>
              <option value="L">L</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="flex flex-col gap-0.5 sm:col-span-2">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Product</span>
            <input
              type="text"
              list="nutrition-products"
              className={fieldClass}
              placeholder="e.g. Urea, UAN-32, MAP"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
            />
            <datalist id="nutrition-products">
              {PRODUCT_SUGGESTIONS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Rate</span>
            <input
              type="number"
              min={0}
              step="0.1"
              className={fieldClass}
              value={rate || ''}
              onChange={(e) => setRate(Number(e.target.value) || 0)}
              placeholder="0"
            />
          </label>
        </div>

        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1">
            Elemental (optional, kg/ha)
          </p>
          <div className="grid grid-cols-3 gap-2">
            <label className="flex items-center gap-1">
              <span className="text-[10px] font-bold text-slate-500 w-4">N</span>
              <input
                type="number"
                min={0}
                step="0.1"
                className={cn(fieldClass, 'w-full')}
                value={nRate}
                onChange={(e) => setNRate(e.target.value)}
                placeholder="—"
              />
            </label>
            <label className="flex items-center gap-1">
              <span className="text-[10px] font-bold text-slate-500 w-4">P</span>
              <input
                type="number"
                min={0}
                step="0.1"
                className={cn(fieldClass, 'w-full')}
                value={pRate}
                onChange={(e) => setPRate(e.target.value)}
                placeholder="—"
              />
            </label>
            <label className="flex items-center gap-1">
              <span className="text-[10px] font-bold text-slate-500 w-4">K</span>
              <input
                type="number"
                min={0}
                step="0.1"
                className={cn(fieldClass, 'w-full')}
                value={kRate}
                onChange={(e) => setKRate(e.target.value)}
                placeholder="—"
              />
            </label>
          </div>
        </div>

        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Notes</span>
          <input
            type="text"
            className={fieldClass}
            placeholder="Optional — tank mix, weather, reason…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleLog}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold"
          >
            <Beaker className="w-3.5 h-3.5" />
            Log to diary
          </button>
          {loggedFlash && (
            <span className="text-[11px] font-medium text-emerald-600 inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-600" />
            Recent applications
          </h2>
          <Link to="/diary" className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900">
            All in diary
          </Link>
        </div>
        {recentNutrition.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-slate-400">No nutrition applications logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[9px] font-bold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Block</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 hidden sm:table-cell">NPK</th>
                  <th className="px-3 py-2 hidden md:table-cell">Method</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentNutrition.map((event) => {
                  const block = blocks.find((b) => b.id === event.blockId);
                  return (
                    <tr key={event.id} className="text-slate-700">
                      <td className="px-3 py-2 font-medium whitespace-nowrap">
                        {new Date(event.date).toLocaleDateString('en-AU', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </td>
                      <td className="px-3 py-2 truncate max-w-[100px]">{block?.name || '—'}</td>
                      <td className="px-3 py-2 font-semibold text-emerald-800">{event.productName || '—'}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {event.rate != null ? (
                          <>
                            {event.rate}
                            <span className="text-slate-400 ml-0.5">{event.rateUnit || ''}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-500 hidden sm:table-cell whitespace-nowrap">
                        {npkSummary(event)}
                      </td>
                      <td className="px-3 py-2 text-slate-500 capitalize hidden md:table-cell">
                        {event.nutritionMethod || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
