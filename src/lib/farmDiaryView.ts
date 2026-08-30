import type { DiaryEvent } from './farmDiary';

export type DiaryFilter = 'all' | 'plans' | 'spray' | 'irrigation' | 'nutrition' | 'work';
export type LogTab = 'spray' | 'irrigation' | 'plan';
export type DiaryPageMode = 'timeline' | 'issues';

export const DIARY_FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'plans', label: 'Plans' },
  { id: 'spray', label: 'Spray' },
  { id: 'irrigation', label: 'Water' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'work', label: 'Work' },
] as const satisfies ReadonlyArray<{ id: DiaryFilter; label: string }>;

export const DIARY_CSV_HEADERS = [
  'Date',
  'Type',
  'Status',
  'Title/Product',
  'Assignee',
  'Amount (MM)',
  'Duration (Mins)',
  'Rate',
  'NPK',
  'Notes',
] as const;

export function todayInputDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function diaryEventStatus(event: Pick<DiaryEvent, 'status' | 'type'>): string {
  return event.status ?? (event.type === 'work' ? 'planned' : 'done');
}

export function diaryEventMatchesSearch(event: DiaryEvent, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    event.notes?.toLowerCase().includes(q) ||
    event.agentName?.toLowerCase().includes(q) ||
    event.productName?.toLowerCase().includes(q) ||
    event.title?.toLowerCase().includes(q) ||
    event.assignedToName?.toLowerCase().includes(q) ||
    (event.type === 'spray' && !!event.sprayType?.toLowerCase().includes(q))
  );
}

export function filterDiaryEvents(
  events: DiaryEvent[],
  opts: { filter: DiaryFilter; searchQuery: string; focusBlockId: string | null }
): DiaryEvent[] {
  return events.filter((event) => {
    const status = diaryEventStatus(event);
    const matchesFilter =
      opts.filter === 'all' ||
      (opts.filter === 'plans' && event.type === 'work' && status === 'planned') ||
      (opts.filter === 'work' && event.type === 'work') ||
      (opts.filter !== 'plans' && opts.filter !== 'work' && event.type === opts.filter);
    const matchesSearch = diaryEventMatchesSearch(event, opts.searchQuery);
    const matchesBlock = !opts.focusBlockId || (event.blockId || 'general') === opts.focusBlockId;
    return matchesFilter && matchesSearch && matchesBlock;
  });
}

export function groupEventsByBlock(events: DiaryEvent[]): Record<string, DiaryEvent[]> {
  return events.reduce((acc, event) => {
    const blockId = event.blockId || 'general';
    if (!acc[blockId]) acc[blockId] = [];
    acc[blockId].push(event);
    return acc;
  }, {} as Record<string, DiaryEvent[]>);
}

export function sortDiaryBlockIds(
  grouped: Record<string, DiaryEvent[]>,
  focusBlockId: string | null,
  blocks: { id: string; name?: string }[]
): string[] {
  const ids = Object.keys(grouped);
  if (focusBlockId && !ids.includes(focusBlockId)) ids.unshift(focusBlockId);
  return ids.sort((a, b) => {
    if (focusBlockId) {
      if (a === focusBlockId) return -1;
      if (b === focusBlockId) return 1;
    }
    if (a === 'general') return -1;
    if (b === 'general') return 1;
    const blockA = blocks.find((bl) => bl.id === a)?.name || '';
    const blockB = blocks.find((bl) => bl.id === b)?.name || '';
    return blockA.localeCompare(blockB);
  });
}

export function diaryEventToCsvRow(e: DiaryEvent): string[] {
  const npk = [
    e.nRate != null ? `N${e.nRate}` : '',
    e.pRate != null ? `P${e.pRate}` : '',
    e.kRate != null ? `K${e.kRate}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return [
    e.date,
    e.type,
    e.status || (e.type === 'work' ? 'planned' : 'done'),
    e.title || e.productName || e.agentName || (e.type === 'spray' ? e.sprayType : '') || '',
    e.assignedToName || '',
    e.irrigationAmount ? String(e.irrigationAmount) : '',
    e.durationMinutes ? String(e.durationMinutes) : '',
    e.rate != null ? `${e.rate}${e.rateUnit ? ` ${e.rateUnit}` : ''}` : '',
    npk,
    e.notes || '',
  ];
}

export function diaryEventsToCsv(events: DiaryEvent[]): string {
  return [
    DIARY_CSV_HEADERS.join(','),
    ...events.map((e) => diaryEventToCsvRow(e).map((cell) => `"${cell}"`).join(',')),
  ].join('\n');
}

export function downloadDiaryCsv(events: DiaryEvent[], now = new Date()): void {
  const csvContent = diaryEventsToCsv(events);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `farm_log_export_${todayInputDate(now)}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
