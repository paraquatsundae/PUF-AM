"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncFinancialAggregates = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const db_1 = require("./db");
const db = (0, db_1.getDb)();
function applyTransactionToAggregate(aggregate, tx, multiplier) {
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
exports.syncFinancialAggregates = (0, firestore_1.onDocumentWritten)({ document: "farms/{farmId}/financial_transactions/{txId}", database: db_1.FIRESTORE_DATABASE_ID }, async (event) => {
    const farmId = event.params.farmId;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const aggRef = db.doc(`farms/${farmId}/aggregates/financials`);
    const updates = {};
    if (before) {
        const reversed = { totalIncome: 0, totalExpense: 0 };
        applyTransactionToAggregate(reversed, before, -1);
        for (const [key, value] of Object.entries(reversed)) {
            if (value !== 0)
                updates[key] = (updates[key] || 0) + value;
        }
    }
    if (after) {
        const added = { totalIncome: 0, totalExpense: 0 };
        applyTransactionToAggregate(added, after, 1);
        for (const [key, value] of Object.entries(added)) {
            if (value !== 0)
                updates[key] = (updates[key] || 0) + value;
        }
    }
    if (Object.keys(updates).length === 0)
        return;
    const firestoreUpdates = {
        lastUpdated: new Date().toISOString(),
    };
    for (const [key, value] of Object.entries(updates)) {
        firestoreUpdates[key] = firestore_2.FieldValue.increment(value);
    }
    await aggRef.set(firestoreUpdates, { merge: true });
});
//# sourceMappingURL=financialAggregate.js.map