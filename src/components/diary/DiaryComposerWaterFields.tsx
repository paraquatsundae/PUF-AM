type Props = {
  amount: string;
  onAmount: (value: string) => void;
  duration: string;
  onDuration: (value: string) => void;
};

export function DiaryComposerWaterFields({ amount, onAmount, duration, onDuration }: Props) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">Volume (MM)</label>
          <input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => onAmount(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">Duration (Mins)</label>
          <input
            type="number"
            placeholder="0"
            value={duration}
            onChange={(e) => onDuration(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all"
          />
        </div>
      </div>
    </div>
  );
}
