import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useMapStore } from '../lib/mapStore';
import { AddTransactionModal } from '../components/AddTransactionModal';
import { DollarSign, Plus, Trash2, TrendingDown, TrendingUp, Map as MapIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { useFinancialTransactions } from '../hooks/useFinancialTransactions';
import {
  financialBlockRows,
  financialsForYear,
  financialTotals,
  financialYearOptions,
  money,
  moneyExact,
} from '../lib/financialsView';

export function Financials() {
  const { user, userData } = useAuth();
  const { blocks } = useMapStore();
  const farmId = userData?.farmId;
  const { transactions, loading, addTransaction, deleteTransaction } = useFinancialTransactions(
    farmId,
    user?.uid
  );

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'expense' | 'income'>('expense');

  const yearOptions = useMemo(
    () => financialYearOptions(transactions, currentYear),
    [transactions, currentYear]
  );
  const yearTxs = useMemo(() => financialsForYear(transactions, year), [transactions, year]);
  const blockRows = useMemo(() => financialBlockRows(yearTxs, blocks), [blocks, yearTxs]);
  const totals = useMemo(() => financialTotals(yearTxs), [yearTxs]);

  const blockName = (blockId?: string) => {
    if (!blockId) return 'Whole farm';
    return blocks.find((b) => b.id === blockId)?.name || 'Unknown block';
  };

  if (!farmId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-slate-500">
        Sign in with a farm account to use financials.
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Financials</h1>
            <p className="text-sm text-slate-500 mt-1 max-w-xl">
              High-level paddock budget by block — not full accounting.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide self-start sm:self-auto">
            Year
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-800"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
              Inputs
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{money(totals.inputs)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              Revenue
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{money(totals.revenue)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              <DollarSign className="w-3.5 h-3.5 text-slate-500" />
              Margin
            </div>
            <p
              className={cn(
                'mt-2 text-2xl font-bold tabular-nums',
                totals.margin >= 0 ? 'text-emerald-700' : 'text-rose-700'
              )}
            >
              {money(totals.margin)}
            </p>
          </div>
        </div>

        {/* Soft keys — primary actions in the main body (tablet-friendly) */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setModalType('expense');
              setModalOpen(true);
            }}
            className="flex items-center gap-4 min-h-[4.5rem] px-5 py-4 rounded-2xl bg-white border-2 border-slate-200 text-left shadow-sm hover:border-slate-400 hover:bg-slate-50 active:scale-[0.99] transition-all"
          >
            <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-slate-900 text-white shrink-0">
              <Plus className="w-6 h-6" />
            </span>
            <span>
              <span className="block text-base font-bold text-slate-900">Log input</span>
              <span className="block text-sm text-slate-500 mt-0.5">Spray, fert, labour, fuel — cost against a block</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setModalType('income');
              setModalOpen(true);
            }}
            className="flex items-center gap-4 min-h-[4.5rem] px-5 py-4 rounded-2xl bg-white border-2 border-emerald-200 text-left shadow-sm hover:border-emerald-400 hover:bg-emerald-50/50 active:scale-[0.99] transition-all"
          >
            <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-600 text-white shrink-0">
              <Plus className="w-6 h-6" />
            </span>
            <span>
              <span className="block text-base font-bold text-slate-900">Log revenue</span>
              <span className="block text-sm text-slate-500 mt-0.5">Production payment or sale — income by block</span>
            </span>
          </button>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-slate-900">By block</h2>
            {blocks.length === 0 && (
              <Link
                to="/map"
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
              >
                <MapIcon className="w-3.5 h-3.5" />
                Add blocks on the map
              </Link>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 bg-slate-50">
                  <th className="px-4 py-2.5 font-semibold">Block</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Area (ha)</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Inputs</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Revenue</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      Loading…
                    </td>
                  </tr>
                ) : blockRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      No blocks or entries yet for {year}.
                    </td>
                  </tr>
                ) : (
                  blockRows.map((row) => {
                    const margin = row.revenue - row.inputs;
                    return (
                      <tr key={row.key} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                        <td className="px-4 py-3 text-right text-slate-500 tabular-nums">
                          {row.areaHa ? row.areaHa.toFixed(1) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                          {money(row.inputs)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                          {money(row.revenue)}
                        </td>
                        <td
                          className={cn(
                            'px-4 py-3 text-right font-semibold tabular-nums',
                            margin >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          )}
                        >
                          {money(margin)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">Recent entries · {year}</h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {yearTxs.length === 0 && !loading && (
              <li className="px-4 py-8 text-center text-sm text-slate-400">
                No entries yet. Use Log input or Log revenue.
              </li>
            )}
            {yearTxs.slice(0, 40).map((tx) => (
              <li key={tx.id} className="px-4 py-3 flex items-start gap-3">
                <div
                  className={cn(
                    'mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                    tx.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                  )}
                >
                  {tx.type === 'income' ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-medium text-slate-900 truncate">{tx.description}</p>
                    <p
                      className={cn(
                        'font-semibold tabular-nums shrink-0',
                        tx.type === 'income' ? 'text-emerald-700' : 'text-slate-800'
                      )}
                    >
                      {tx.type === 'income' ? '+' : '−'}
                      {moneyExact(Number(tx.amount) || 0)}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {tx.date} · {blockName(tx.blockId)}
                    {tx.type === 'expense' ? ` · ${tx.category}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void deleteTransaction(tx)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg shrink-0"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <AddTransactionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        initialType={modalType}
        blocks={blocks.map((b) => ({ id: b.id, name: b.name || b.id }))}
        onAdd={addTransaction}
      />
    </div>
  );
}
