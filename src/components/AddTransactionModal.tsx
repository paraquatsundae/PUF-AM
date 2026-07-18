import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export type BlockOption = { id: string; name: string };

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Prefer 'expense' (paddock input) or 'income' (production revenue). */
  initialType?: 'expense' | 'income';
  blocks: BlockOption[];
  onAdd: (data: {
    date: string;
    type: 'expense' | 'income';
    category: string;
    amount: number;
    description: string;
    blockId?: string;
  }) => Promise<void>;
}

const EXPENSE_CATEGORIES = [
  { id: 'Paddock Inputs', label: 'Spray / fertiliser / chemical' },
  { id: 'Labour', label: 'Labour / contract work' },
  { id: 'Machinery', label: 'Machinery / fuel' },
  { id: 'Energy', label: 'Power / pumping' },
  { id: 'Other', label: 'Other cost' },
];

export function AddTransactionModal({
  isOpen,
  onClose,
  initialType = 'expense',
  blocks,
  onAdd,
}: AddTransactionModalProps) {
  const amountRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'expense' as 'expense' | 'income',
    category: 'Paddock Inputs',
    amount: '',
    description: '',
    blockId: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const type = initialType;
    setFormData({
      date: new Date().toISOString().split('T')[0],
      type,
      category: type === 'income' ? 'Production' : 'Paddock Inputs',
      amount: '',
      description: '',
      blockId: blocks.length === 1 ? blocks[0].id : '',
    });
    setError(null);
    const t = window.setTimeout(() => amountRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [isOpen, initialType, blocks]);

  if (!isOpen) return null;

  const isIncome = formData.type === 'income';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amount = Number(formData.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (!formData.description.trim()) {
      setError(isIncome ? 'Add a short note for what the revenue is.' : 'Add a short note for what the cost is.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onAdd({
        date: formData.date,
        type: formData.type,
        category: isIncome ? 'Production' : formData.category,
        amount,
        description: formData.description.trim(),
        ...(formData.blockId ? { blockId: formData.blockId } : {}),
      });
      onClose();
    } catch (err) {
      console.error('Error adding transaction:', err);
      setError('Could not save. Check connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[6000] flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-lg overflow-hidden max-h-[92vh] flex flex-col">
        <div
          className={`flex items-center justify-between px-5 py-4 border-b ${
            isIncome ? 'border-emerald-100 bg-emerald-50/80' : 'border-slate-100 bg-slate-50'
          }`}
        >
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              {isIncome ? 'Production revenue' : 'Paddock input'}
            </p>
            <h2 className="text-lg font-bold text-slate-900">
              {isIncome ? 'Log money in' : 'Log money out'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 text-slate-500 hover:text-slate-800 rounded-xl hover:bg-white/80"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5 overflow-y-auto">
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Block</label>
            <select
              value={formData.blockId}
              onChange={(e) => setFormData({ ...formData, blockId: e.target.value })}
              className="w-full min-h-12 px-3 py-3 text-base rounded-xl border border-slate-200 bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none"
            >
              <option value="">Whole farm / unallocated</option>
              {blocks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name || b.id}
                </option>
              ))}
            </select>
            {blocks.length === 0 && (
              <p className="mt-1.5 text-xs text-amber-700">
                No blocks yet — entry will sit under Whole farm until you draw paddocks on the map.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Amount (AUD)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-lg">$</span>
              <input
                ref={amountRef}
                type="number"
                inputMode="decimal"
                required
                min="0.01"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full min-h-14 pl-8 pr-3 py-3 text-2xl font-bold tabular-nums rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Date</label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full min-h-12 px-3 py-3 text-base rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none"
              />
            </div>
            {!isIncome ? (
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Cost type</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full min-h-12 px-3 py-3 text-base rounded-xl border border-slate-200 bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none"
                >
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Type</label>
                <div className="min-h-12 px-3 py-3 text-base rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-900 font-medium flex items-center">
                  Production sale
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">
              {isIncome ? 'Note (buyer / grade / load)' : 'Note (product or job)'}
            </label>
            <input
              type="text"
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full min-h-12 px-3 py-3 text-base rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none"
              placeholder={isIncome ? 'e.g. Webster — Grade 1 kernel' : 'e.g. Kocide spray Block A'}
              autoComplete="off"
            />
          </div>

          {error && (
            <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>
          )}

          <div className="pt-1 flex flex-col-reverse sm:flex-row gap-3 sticky bottom-0 bg-white pb-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-12 px-4 py-3 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl font-semibold text-base"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex-1 min-h-12 px-4 py-3 text-white rounded-xl font-semibold text-base disabled:opacity-50 ${
                isIncome ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-900 hover:bg-slate-800'
              }`}
            >
              {isSubmitting ? 'Saving…' : isIncome ? 'Save revenue' : 'Save input'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
