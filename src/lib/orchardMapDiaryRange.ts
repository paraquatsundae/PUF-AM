/** Default diary window for orchard-map overlays (past 3 months + 1 month ahead). */
export function orchardMapDiaryDateRange(now = new Date()): { start: string; end: string } {
  const start = new Date(now);
  start.setMonth(start.getMonth() - 3);
  const end = new Date(now);
  end.setMonth(end.getMonth() + 1);
  return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
}
