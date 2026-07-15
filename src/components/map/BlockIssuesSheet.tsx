import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import type { FieldIssue } from '../../lib/fieldStore';
import { cn } from '../../lib/utils';

type Props = {
  blockName: string;
  issues: FieldIssue[];
  onClose: () => void;
  onSelectIssue: (issue: FieldIssue) => void;
  onReport: () => void;
  onResolve?: (issue: FieldIssue) => void;
};

function priorityClass(priority: FieldIssue['priority']) {
  if (priority === 'high') return 'bg-red-100 text-red-700';
  if (priority === 'medium') return 'bg-orange-100 text-orange-700';
  return 'bg-yellow-100 text-yellow-800';
}

export function BlockIssuesSheet({
  blockName,
  issues,
  onClose,
  onSelectIssue,
  onReport,
  onResolve,
}: Props) {
  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-[1200] sm:inset-auto sm:left-1/2 sm:bottom-10 sm:-translate-x-1/2 sm:w-full sm:max-w-md p-3 sm:p-0">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden max-h-[70vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-900">Issues · {blockName}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {issues.length === 0 ? 'No open issues' : `${issues.length} open`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-2 space-y-2">
          {issues.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              Nothing open in this paddock.
            </div>
          ) : (
            issues.map((issue) => (
              <button
                key={issue.id}
                type="button"
                onClick={() => onSelectIssue(issue)}
                className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-amber-300 hover:bg-amber-50/40 transition-colors"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 text-sm">
                        {issue.note ||
                          issue.category.charAt(0).toUpperCase() + issue.category.slice(1)}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                          priorityClass(issue.priority)
                        )}
                      >
                        {issue.priority}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 capitalize">
                      {issue.priority} · {issue.category} ·{' '}
                      {new Date(issue.reportedAt).toLocaleString()}
                    </p>
                  </div>
                  {onResolve && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onResolve(issue);
                      }}
                      className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 shrink-0"
                      title="Mark resolved"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="shrink-0 border-t border-slate-100 p-3 bg-slate-50/80">
          <button
            type="button"
            onClick={onReport}
            className="w-full py-2.5 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700"
          >
            Report issue here
          </button>
        </div>
      </div>
    </div>
  );
}
