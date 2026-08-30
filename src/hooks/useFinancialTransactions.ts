import { useCallback, useEffect, useState } from 'react';
import { collection, doc, getDocs, increment, limit, orderBy, query, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { FinancialTx } from '../lib/financialsView';

export type FinancialTxDraft = {
  date: string;
  type: 'expense' | 'income';
  category: string;
  amount: number;
  description: string;
  blockId?: string;
};

function applyAggregate(
  updates: Record<string, ReturnType<typeof increment>>,
  data: { date: string; type: 'expense' | 'income'; category?: string; amount: number },
  sign: 1 | -1
) {
  const amount = (Number(data.amount) || 0) * sign;
  const isIncome = data.type === 'income';
  const monthKey = data.date.slice(0, 7);
  updates.totalIncome = increment(isIncome ? amount : 0);
  updates.totalExpense = increment(!isIncome ? amount : 0);
  updates[`monthly_${monthKey}_income`] = increment(isIncome ? amount : 0);
  updates[`monthly_${monthKey}_expense`] = increment(!isIncome ? amount : 0);
  if (!isIncome && data.category) {
    updates[`category_${data.category}`] = increment(amount);
  }
}

export function useFinancialTransactions(farmId: string | undefined, uid: string | undefined) {
  const [transactions, setTransactions] = useState<FinancialTx[]>([]);
  const [loading, setLoading] = useState(true);

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

  const addTransaction = async (data: FinancialTxDraft) => {
    if (!farmId || !uid) return;

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
      createdBy: uid,
    };
    if (data.blockId) payload.blockId = data.blockId;
    batch.set(txRef, payload);

    if (import.meta.env.DEV) {
      const aggRef = doc(db, `farms/${farmId}/aggregates/financials`);
      const updates: Record<string, ReturnType<typeof increment>> = {};
      applyAggregate(updates, data, 1);
      batch.set(aggRef, updates, { merge: true });
    }

    await batch.commit();
    await loadTransactions();
  };

  const deleteTransaction = async (tx: FinancialTx) => {
    if (!farmId) return;
    if (!window.confirm('Delete this entry?')) return;

    const batch = writeBatch(db);
    batch.delete(doc(db, `farms/${farmId}/financial_transactions`, tx.id));

    if (import.meta.env.DEV) {
      const aggRef = doc(db, `farms/${farmId}/aggregates/financials`);
      const updates: Record<string, ReturnType<typeof increment>> = {};
      applyAggregate(updates, tx, -1);
      batch.set(aggRef, updates, { merge: true });
    }

    await batch.commit();
    await loadTransactions();
  };

  return { transactions, loading, addTransaction, deleteTransaction };
}
