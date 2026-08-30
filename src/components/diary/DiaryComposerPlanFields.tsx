import { AlertTriangle } from 'lucide-react';
import type { WorkPriority } from '../../lib/farmDiary';
import { cn } from '../../lib/utils';

type Props = {
  linkedIssueId: string | null;
  onUnlinkIssue: () => void;
  workTitle: string;
  onWorkTitle: (value: string) => void;
  assigneeName: string;
  onAssigneeName: (value: string) => void;
  workPriority: WorkPriority;
  onWorkPriority: (value: WorkPriority) => void;
  notes: string;
  onNotes: (value: string) => void;
};

export function DiaryComposerPlanFields({
  linkedIssueId,
  onUnlinkIssue,
  workTitle,
  onWorkTitle,
  assigneeName,
  onAssigneeName,
  workPriority,
  onWorkPriority,
  notes,
  onNotes,
}: Props) {
  return (
    <div className="space-y-5">
      {linkedIssueId && (
        <div className="flex items-start justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-xs text-amber-900 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Linked to a field issue — save plan to mark it in progress
          </p>
          <button
            type="button"
            onClick={onUnlinkIssue}
            className="text-[10px] font-bold uppercase text-amber-700 hover:underline shrink-0"
          >
            Unlink
          </button>
        </div>
      )}
      <div>
        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">Work title</label>
        <input
          type="text"
          value={workTitle}
          onChange={(e) => onWorkTitle(e.target.value)}
          placeholder="e.g. Fix drip line in Block 3"
          required
          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">Assign to</label>
        <input
          type="text"
          value={assigneeName}
          onChange={(e) => onAssigneeName(e.target.value)}
          placeholder="Name (optional)"
          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">Priority</label>
        <div className="grid grid-cols-3 gap-2">
          {(['low', 'medium', 'high'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onWorkPriority(p)}
              className={cn(
                'py-2 text-xs font-bold uppercase rounded-xl border capitalize',
                workPriority === p
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-200 text-slate-600'
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          rows={3}
          placeholder="What needs doing, tools, access notes…"
          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900"
        />
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Plans show on the diary timeline. Starting work requires the farm safety checklist.
      </p>
    </div>
  );
}
