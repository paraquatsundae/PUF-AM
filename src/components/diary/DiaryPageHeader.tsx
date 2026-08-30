import { BookOpen } from 'lucide-react';
import type { DiaryPageMode } from '../../lib/farmDiaryView';
import { cn } from '../../lib/utils';

type Props = {
  pageMode: DiaryPageMode;
  openIssueCount: number;
  onPageMode: (mode: DiaryPageMode) => void;
};

export function DiaryPageHeader({ pageMode, openIssueCount, onPageMode }: Props) {
  return (
    <header className="shrink-0 bg-white border-b border-slate-200 px-4 sm:px-6 py-3">
      <div className="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-900 text-white rounded-lg">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">Farm diary</h1>
            <p className="text-xs text-slate-500">
              {pageMode === 'issues'
                ? 'Triage field issues and turn them into plans'
                : 'Plan ahead, then log what was done'}
            </p>
          </div>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => onPageMode('timeline')}
            className={cn(
              'px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg',
              pageMode === 'timeline'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            Timeline
          </button>
          <button
            type="button"
            onClick={() => onPageMode('issues')}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg',
              pageMode === 'issues'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            Issues
            {openIssueCount > 0 && (
              <span
                className={cn(
                  'min-w-[1.25rem] px-1 py-0.5 rounded-md text-[10px] tabular-nums',
                  pageMode === 'issues' ? 'bg-amber-100 text-amber-800' : 'bg-amber-500 text-white'
                )}
              >
                {openIssueCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
