/**
 * Shared Directed at control — Everyone, farm users, or a typed name.
 * Used by highlight compose and issue compose. Do not invent a second mention UI.
 */
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
      <label className="block">
        <span className="text-[9px] font-bold text-slate-400 uppercase">Directed at</span>
        <select
          value={assigneeKey}
          disabled={disabled}
          onChange={(e) => onAssigneeKey(e.target.value)}
          className="mt-1 w-full max-w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm disabled:opacity-50"
        >
          <option value="everyone">Everyone</option>
          {assignees.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
          <option value="other">Someone else</option>
        </select>
      </label>
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
