import { Minus, Plus } from 'lucide-react';

export interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (val: number) => void;
  description?: string;
  unit?: string;
  isLocked: boolean;
}

export function SliderControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
  description,
  unit,
  isLocked,
}: SliderControlProps) {
  const handleIncrement = () => {
    if (isLocked) return;
    const newValue = Math.min(max, value + step);
    onChange(Number(newValue.toFixed(3)));
  };

  const handleDecrement = () => {
    if (isLocked) return;
    const newValue = Math.max(min, value - step);
    onChange(Number(newValue.toFixed(3)));
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-end">
        <label className="text-[10px] font-mono font-bold uppercase text-slate-700">{label}</label>
        <span className="text-xs font-mono font-bold text-slate-900">
          {value}
          {unit}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleDecrement}
          disabled={isLocked || value <= min}
          className="p-1.5 bg-white border border-[#141414] rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Minus className="w-3 h-3" />
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={isLocked}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1 accent-[#141414] disabled:opacity-50 disabled:cursor-not-allowed h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
        />
        <button
          type="button"
          onClick={handleIncrement}
          disabled={isLocked || value >= max}
          className="p-1.5 bg-white border border-[#141414] rounded-md hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
      {description && <p className="text-[9px] italic opacity-60 leading-tight">{description}</p>}
    </div>
  );
}
