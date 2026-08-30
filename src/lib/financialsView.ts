export type FinancialTx = {
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

export type FinancialBlockRow = {
  key: string;
  name: string;
  areaHa: number;
  inputs: number;
  revenue: number;
};

export function money(n: number) {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
}

export function moneyExact(n: number) {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 });
}

export function financialYearOptions(transactions: FinancialTx[], currentYear: number): number[] {
  const ys = new Set<number>([currentYear, currentYear - 1, currentYear - 2]);
  transactions.forEach((t) => {
    const y = Number(t.date?.slice(0, 4));
    if (y) ys.add(y);
  });
  return Array.from(ys).sort((a, b) => b - a);
}

export function financialsForYear(transactions: FinancialTx[], year: number): FinancialTx[] {
  return transactions.filter((t) => t.date?.startsWith(String(year)));
}

export function financialTotals(yearTxs: FinancialTx[]) {
  let inputs = 0;
  let revenue = 0;
  for (const t of yearTxs) {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') revenue += amt;
    else inputs += amt;
  }
  return { inputs, revenue, margin: revenue - inputs };
}

export function financialBlockRows(
  yearTxs: FinancialTx[],
  blocks: { id: string; name?: string; areaHa?: number }[]
): FinancialBlockRow[] {
  const map = new Map<string, FinancialBlockRow>();

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
}
