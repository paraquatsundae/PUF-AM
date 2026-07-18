import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  collection,
  query,
  orderBy,
  getDocs,
  limit,
  doc,
  writeBatch,
  increment,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useMapStore } from '../lib/mapStore';
import { AddTransactionModal } from '../components/AddTransactionModal';
import { DollarSign, Plus, Trash2, TrendingDown, TrendingUp, Map as MapIcon } from 'lucide-react';
import { cn } from '../lib/utils';

type FinancialTx = {
  id: string;
  date: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  description: string;
  blockId?: string;
  createdAt?: string;
  createdBy?: string;
};

function money(n: number) {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
}

function moneyExact(n: number) {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 });
}

export function Financials() {
  const { user, userData } = useAuth();
  const { blocks } = useMapStore();
  const farmId = userData?.farmId;

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [transactions, setTransactions] = useState<FinancialTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'expense' | 'income'>('expense');

  const yearOptions = useMemo(() => {
    const ys = new Set<number>([currentYear, currentYear - 1, currentYear - 2]);
    transactions.forEach((t) => {
      const y = Number(t.date?.slice(0, 4));
      if (y) ys.add(y);
    });
    return Array.from(ys).sort((a, b) => b - a);
  }, [transactions, currentYear]);

  const loadTransactions = useCallback(async () => {
    if (!farmId) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, `farms/${farmId}/financial_transactions`),
        orderBy('date', 'desc'),
        limit(500)
      );
      const snap = await getDocs(q);
      setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FinancialTx)));
    } catch (err) {
      console.error('Failed to load financial transactions', err);
    } finally {
      setLoading(false);
    }
  }, [farmId]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  const yearTxs = useMemo(
    () => transactions.filter((t) => t.date?.startsWith(String(year))),
    [transactions, year]
  );

  const blockName = useCallback(
    (blockId?: string) => {
      if (!blockId) return 'Whole farm';
      return blocks.find((b) => b.id === blockId)?.name || 'Unknown block';
    },
    [blocks]
  );

  const blockRows = useMemo(() => {
    const map = new Map<
      string,
      { key: string; name: string; areaHa: number; inputs: number; revenue: number }
    >();

    for (const b of blocks) {
      map.set(b.id, {
        key: b.id,
        name: b.name || b.id,
        areaHa: b.areaHa || 0,
        inputs: 0,
        revenue: 0,
      });
    }
    map.set('__unallocated__', {
      key: '__unallocated__',
      name: 'Whole farm / unallocated',
      areaHa: 0,
      inputs: 0,
      revenue: 0,
    });

    for (const t of yearTxs) {
      const key = t.blockId && map.has(t.blockId) ? t.blockId : '__unallocated__';
      const row = map.get(key)!;
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') row.revenue += amt;
      else row.inputs += amt;
    }

    return Array.from(map.values())
      .filter((r) => r.key !== '__unallocated__' || r.inputs > 0 || r.revenue > 0 || blocks.length === 0)
      .sort((a, b) => {
        if (a.key === '__unallocated__') return 1;
        if (b.key === '__unallocated__') return -1;
        return a.name.localeCompare(b.name);
      });
  }, [blocks, yearTxs]);

  const totals = useMemo(() => {
    let inputs = 0;
    let revenue = 0;
    for (const t of yearTxs) {
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') revenue += amt;
      else inputs += amt;
    }
    return { inputs, revenue, margin: revenue - inputs };
  }, [yearTxs]);

  const handleAddTransaction = async (data: {
    date: string;
    type: 'expense' | 'income';
    category: string;
    amount: number;
    description: string;
    blockId?: string;
  }) => {
    if (!farmId || !user) return;

    const batch = writeBatch(db);
    const txRef = doc(collection(db, `farms/${farmId}/financial_transactions`));
    const payload: Record<string, unknown> = {
      id: txRef.id,
      date: data.date,
      type: data.type,
      category: data.category,
      amount: data.amount,
      description: data.description,
      createdAt: new Date().toISOString(),
      createdBy: user.uid,
    };
    if (data.blockId) payload.blockId = data.blockId;
    batch.set(txRef, payload);

    if (import.meta.env.DEV) {
      const aggRef = doc(db, `farms/${farmId}/aggregates/financials`);
      const amount = Number(data.amount) || 0;
      const isIncome = data.type === 'income';
      const monthKey = data.date.slice(0, 7);
      const updates: Record<string, ReturnType<typeof increment>> = {
        totalIncome: isIncome ? increment(amount) : increment(0),
        totalExpense: !isIncome ? increment(amount) : increment(0),
        [`monthly_${monthKey}_income`]: isIncome ? increment(amount) : increment(0),
        [`monthly_${monthKey}_expense`]: !isIncome ? increment(amount) : increment(0),
      };
      if (!isIncome && data.category) {
        updates[`category_${data.category}`] = increment(amount);
      }
      batch.set(aggRef, updates, { merge: true });
    }

    await batch.commit();
    await loadTransactions();
  };

  const handleDeleteTransaction = async (tx: FinancialTx) => {
    if (!farmId) return;
    if (!window.confirm('Delete this entry?')) return;

    const batch = writeBatch(db);
    batch.delete(doc(db, `farms/${farmId}/financial_transactions`, tx.id));

    if (import.meta.env.DEV) {
      const aggRef = doc(db, `farms/${farmId}/aggregates/financials`);
      const amount = Number(tx.amount) || 0;
      const isIncome = tx.type === 'income';
      const monthKey = tx.date.slice(0, 7);
      const updates: Record<string, ReturnType<typeof increment>> = {
        totalIncome: isIncome ? increment(-amount) : increment(0),
        totalExpense: !isIncome ? increment(-amount) : increment(0),
        [`monthly_${monthKey}_income`]: isIncome ? increment(-amount) : increment(0),
        [`monthly_${monthKey}_expense`]: !isIncome ? increment(-amount) : increment(0),
      };
      if (!isIncome && tx.category) {
        updates[`category_${tx.category}`] = increment(-amount);
      }
      batch.set(aggRef, updates, { merge: true });
    }

    await batch.commit();
    await loadTransactions();
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
                  onClick={() => void handleDeleteTransaction(tx)}
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
        onAdd={handleAddTransaction}
      />
    </div>
  );
}
