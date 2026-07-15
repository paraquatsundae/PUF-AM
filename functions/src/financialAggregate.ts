import * as admin from "firebase-admin";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { FieldValue } from "firebase-admin/firestore";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function applyTransactionToAggregate(
  aggregate: Record<string, number>,
  tx: { type?: string; amount?: number; date?: string; category?: string },
  multiplier: 1 | -1
) {
  const amount = (Number(tx.amount) || 0) * multiplier;
  const isIncome = tx.type === "income";
  const monthKey = tx.date?.slice(0, 7) || "";

  aggregate.totalIncome = (aggregate.totalIncome || 0) + (isIncome ? amount : 0);
  aggregate.totalExpense = (aggregate.totalExpense || 0) + (!isIncome ? amount : 0);

  if (monthKey) {
    const incomeKey = `monthly_${monthKey}_income`;
    const expenseKey = `monthly_${monthKey}_expense`;
    aggregate[incomeKey] = (aggregate[incomeKey] || 0) + (isIncome ? amount : 0);
    aggregate[expenseKey] = (aggregate[expenseKey] || 0) + (!isIncome ? amount : 0);
  }

  if (!isIncome && tx.category) {
    const catKey = `category_${tx.category}`;
    aggregate[catKey] = (aggregate[catKey] || 0) + amount;
  }
}

/** Maintains farms/{farmId}/aggregates/financials on transaction writes (Step 12). */
export const syncFinancialAggregates = onDocumentWritten(
  "farms/{farmId}/financial_transactions/{txId}",
  async (event) => {
    const farmId = event.params.farmId;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const aggRef = db.doc(`farms/${farmId}/aggregates/financials`);

    const updates: Record<string, number> = {};

    if (before) {
      const reversed: Record<string, number> = { totalIncome: 0, totalExpense: 0 };
      applyTransactionToAggregate(reversed, before as any, -1);
      for (const [key, value] of Object.entries(reversed)) {
        if (value !== 0) updates[key] = (updates[key] || 0) + value;
      }
    }

    if (after) {
      const added: Record<string, number> = { totalIncome: 0, totalExpense: 0 };
      applyTransactionToAggregate(added, after as any, 1);
      for (const [key, value] of Object.entries(added)) {
        if (value !== 0) updates[key] = (updates[key] || 0) + value;
      }
    }

    if (Object.keys(updates).length === 0) return;

    const firestoreUpdates: Record<string, unknown> = {
      lastUpdated: new Date().toISOString(),
    };

    for (const [key, value] of Object.entries(updates)) {
      firestoreUpdates[key] = FieldValue.increment(value);
    }

    await aggRef.set(firestoreUpdates, { merge: true });
  }
);
