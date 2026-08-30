import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Droplets } from 'lucide-react';
import { cn } from '../../lib/utils';
import { irrigationTypeToStyle } from '../../lib/waterPlanning';
import { WATER_FIELD_CLASS } from './waterFieldClass';

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

export function LogIrrigationPanel({
  blocks,
  irrigationSystemType,
  etcDeficit,
  onLog,
}: {
  blocks: { id: string; name: string }[];
  irrigationSystemType?: string;
  etcDeficit: number;
  onLog: (event: {
    date: string;
    type: 'irrigation';
    irrigationAmount: number;
    durationMinutes: number;
    notes: string;
  }) => void;
}) {
  const [systemStyle, setSystemStyle] = useState('micro-sprinkler');
  const [outputRate, setOutputRate] = useState<number>(2.5);
  const [block, setBlock] = useState('');
  const [eventDate, setEventDate] = useState(todayIso);
  const [inputMode, setInputMode] = useState<'time' | 'depth'>('depth');
  const [runTime, setRunTime] = useState<number>(12);
  const [depth, setDepth] = useState<number>(30);
  const [fertigation, setFertigation] = useState(false);
  const [fertilizerType, setFertilizerType] = useState('UAN-32');
  const [injectionRate, setInjectionRate] = useState<number>(50);
  const [loggedFlash, setLoggedFlash] = useState(false);

  useEffect(() => {
    if (!block && blocks.length > 0) setBlock(blocks[0].id);
  }, [blocks, block]);

  useEffect(() => {
    setSystemStyle(irrigationTypeToStyle(irrigationSystemType || 'micro'));
  }, [irrigationSystemType]);

  useEffect(() => {
    if (inputMode === 'time') {
      setDepth(Number((runTime * outputRate).toFixed(1)));
    } else if (outputRate > 0) {
      setRunTime(Number((depth / outputRate).toFixed(1)));
    }
  }, [runTime, depth, outputRate, inputMode]);

  const handleLog = () => {
    if (!block) {
      alert('Select a block first.');
      return;
    }
    const blockName = blocks.find((b) => b.id === block)?.name || block;
    onLog({
      date: eventDate || todayIso(),
      type: 'irrigation',
      irrigationAmount: depth,
      durationMinutes: runTime * 60,
      notes: `Irrigated ${blockName} via ${systemStyle}.${
        fertigation ? ` Fertigation: ${injectionRate}L of ${fertilizerType}.` : ''
      }`,
    });
    setLoggedFlash(true);
    window.setTimeout(() => setLoggedFlash(false), 2000);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Log irrigation</h2>
          <p className="text-[11px] text-slate-500">Writes to Farm Diary — no pump control</p>
        </div>
        <Link to="/diary" className="text-[11px] font-semibold text-sky-700 hover:text-sky-900 inline-flex items-center gap-1">
          Diary <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <label className="flex flex-col gap-0.5 col-span-2 sm:col-span-1">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Block</span>
          <select className={WATER_FIELD_CLASS} value={block} onChange={(e) => setBlock(e.target.value)}>
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
            className={WATER_FIELD_CLASS}
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">System</span>
          <select className={WATER_FIELD_CLASS} value={systemStyle} onChange={(e) => setSystemStyle(e.target.value)}>
            <option value="micro-sprinkler">Micro-sprinkler</option>
            <option value="drip-tape">Drip</option>
            <option value="sdi">SDI</option>
            <option value="flood">Flood</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Rate mm/hr</span>
          <input
            type="number"
            step="0.1"
            className={WATER_FIELD_CLASS}
            value={outputRate}
            onChange={(e) => setOutputRate(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex bg-slate-100 p-0.5 rounded-lg">
          <button
            type="button"
            className={cn(
              'px-2.5 py-1 text-[10px] font-semibold rounded-md',
              inputMode === 'depth' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            )}
            onClick={() => setInputMode('depth')}
          >
            Depth
          </button>
          <button
            type="button"
            className={cn(
              'px-2.5 py-1 text-[10px] font-semibold rounded-md',
              inputMode === 'time' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            )}
            onClick={() => setInputMode('time')}
          >
            Hours
          </button>
        </div>
        {inputMode === 'depth' ? (
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Depth</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                className={cn(WATER_FIELD_CLASS, 'w-24')}
                value={depth}
                onChange={(e) => {
                  setInputMode('depth');
                  setDepth(Number(e.target.value));
                }}
              />
              <span className="text-[10px] text-slate-400">mm · ~{runTime}h</span>
            </div>
          </label>
        ) : (
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Duration</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                className={cn(WATER_FIELD_CLASS, 'w-24')}
                value={runTime}
                onChange={(e) => {
                  setInputMode('time');
                  setRunTime(Number(e.target.value));
                }}
              />
              <span className="text-[10px] text-slate-400">h · ~{depth}mm</span>
            </div>
          </label>
        )}
        {etcDeficit > 0 && (
          <p className="text-[11px] text-slate-500 pb-1">
            Covers ~{Math.round(Math.min(100, (depth / etcDeficit) * 100))}% of 7d ETc deficit
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
        <input
          type="checkbox"
          checked={fertigation}
          onChange={(e) => setFertigation(e.target.checked)}
          className="rounded border-slate-300"
        />
        Fertigation note
      </label>
      {fertigation && (
        <div className="grid grid-cols-2 gap-2">
          <select
            className={WATER_FIELD_CLASS}
            value={fertilizerType}
            onChange={(e) => setFertilizerType(e.target.value)}
          >
            <option>UAN-32</option>
            <option>KTS</option>
            <option>CAN-17</option>
          </select>
          <div className="flex items-center gap-1">
            <input
              type="number"
              className={cn(WATER_FIELD_CLASS, 'w-full')}
              value={injectionRate}
              onChange={(e) => setInjectionRate(Number(e.target.value))}
            />
            <span className="text-[10px] text-slate-400 shrink-0">L</span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleLog}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold"
        >
          <Droplets className="w-3.5 h-3.5" />
          Log to diary
        </button>
        {loggedFlash && (
          <span className="text-[11px] font-medium text-emerald-600 inline-flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
