/**
 * Shared Directed at chips — Everyone / people / typed name.
 * Used by highlight compose and issue compose. Do not invent a second mention UI.
 */
import { cn } from '../../lib/utils';
import type { HighlightAssigneeOption } from '../../lib/highlightAssignees';

type Props = {
  assignees: HighlightAssigneeOption[];
  assigneeKey: string;
  otherName: string;
  disabled?: boolean;
  onAssigneeKey: (key: string) => void;
  onOtherName: (name: string) => void;
};

export function DirectedAtPicker({
  assignees,
  assigneeKey,
  otherName,
  disabled,
  onAssigneeKey,
  onOtherName,
}: Props) {
  return (
    <div>
      <span className="text-[9px] font-bold text-slate-400 uppercase">Directed at</span>
      <div className="mt-1 flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAssigneeKey('everyone')}
          className={cn(
            'px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors disabled:opacity-50',
            assigneeKey === 'everyone'
              ? 'bg-teal-700 text-white border-teal-700'
              : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-teal-400'
          )}
        >
          Everyone
        </button>
        {assignees.map((person) => (
          <button
            key={person.id}
            type="button"
            disabled={disabled}
            onClick={() => onAssigneeKey(person.id)}
            className={cn(
              'px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors disabled:opacity-50',
              assigneeKey === person.id
                ? 'bg-teal-700 text-white border-teal-700'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-teal-400'
            )}
          >
            {person.name}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAssigneeKey('other')}
          className={cn(
            'px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors disabled:opacity-50',
            assigneeKey === 'other'
              ? 'bg-teal-700 text-white border-teal-700'
              : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-teal-400'
          )}
        >
          Someone else
        </button>
      </div>
      {assigneeKey === 'other' && (
        <input
          type="text"
          maxLength={100}
          value={otherName}
          disabled={disabled}
          onChange={(e) => onOtherName(e.target.value)}
          placeholder="Name"
          className="mt-1.5 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
          autoFocus
        />
      )}
    </div>
  );
}

export function directedAtFromPicker(
  assigneeKey: string,
  otherName: string,
  assignees: HighlightAssigneeOption[]
): { directedAtName?: string; directedAtUid?: string } {
  if (assigneeKey === 'everyone') return {};
  if (assigneeKey === 'other') {
    const name = otherName.trim();
    return name ? { directedAtName: name } : {};
  }
  const picked = assignees.find((a) => a.id === assigneeKey);
  if (!picked) return {};
  return { directedAtName: picked.name, directedAtUid: picked.id };
}
