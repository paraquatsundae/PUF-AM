import { X } from 'lucide-react';
import type { FieldIssue } from '../../lib/fieldStore';

export function OperateIssueDetailSheet({
  issue,
  canResolve,
  onClose,
  onResolve,
}: {
  issue: FieldIssue;
  canResolve: boolean;
  onClose: () => void;
  onResolve: () => void;
}) {
  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-[1200] sm:inset-auto sm:left-1/2 sm:bottom-10 sm:-translate-x-1/2 sm:w-full sm:max-w-md p-3 sm:p-0">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {issue.note || `${issue.category.charAt(0).toUpperCase()}${issue.category.slice(1)} issue`}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 capitalize">
              {issue.priority} priority · {issue.status}
              {!issue.note ? ` · ${issue.category}` : ''}
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
        <div className="px-4 pb-4 space-y-3">
          <p className="text-[10px] text-slate-400 capitalize">
            {issue.category} · reported {new Date(issue.reportedAt).toLocaleString()}
          </p>
          {canResolve && issue.status !== 'resolved' && (
            <button
              type="button"
              onClick={onResolve}
              className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
            >
              Mark resolved
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
