import { describe, expect, it } from 'vitest';
import {
  financialBlockRows,
  financialsForYear,
  financialTotals,
  financialYearOptions,
  type FinancialTx,
} from './financialsView';

function tx(partial: Partial<FinancialTx> & Pick<FinancialTx, 'id' | 'date' | 'type' | 'amount'>): FinancialTx {
  return {
    category: 'other',
    description: '',
    ...partial,
  };
}

describe('financialsView', () => {
  it('keeps current and prior years plus years present on rows', () => {
    const rows = [
      tx({ id: '1', date: '2024-01-01', type: 'expense', amount: 1 }),
      tx({ id: '2', date: '2021-06-01', type: 'income', amount: 2 }),
    ];
    expect(financialYearOptions(rows, 2026)).toEqual([2026, 2025, 2024, 2021]);
  });

  it('filters a year and totals income vs expense', () => {
    const rows = [
      tx({ id: '1', date: '2026-01-01', type: 'income', amount: 100 }),
      tx({ id: '2', date: '2026-02-01', type: 'expense', amount: 40 }),
      tx({ id: '3', date: '2025-02-01', type: 'expense', amount: 9 }),
    ];
    const year = financialsForYear(rows, 2026);
    expect(year.map((t) => t.id)).toEqual(['1', '2']);
    expect(financialTotals(year)).toEqual({ inputs: 40, revenue: 100, margin: 60 });
  });

  it('rolls unallocated txs onto the whole-farm row', () => {
    const rows = financialBlockRows(
      [tx({ id: '1', date: '2026-01-01', type: 'expense', amount: 10, description: 'fuel' })],
      [{ id: 'b1', name: 'North', areaHa: 2 }]
    );
    expect(rows.find((r) => r.key === '__unallocated__')?.inputs).toBe(10);
    expect(rows.find((r) => r.key === 'b1')?.name).toBe('North');
  });
});
