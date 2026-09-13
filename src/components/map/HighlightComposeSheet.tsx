/**
 * After painting a “check this” area — note, who it’s for, duration, then send.
 */
import React, { useMemo, useState } from 'react';
import { Send, Undo2, X } from 'lucide-react';
import { useHighlightAssignees } from '../../hooks/useHighlightAssignees';
import {
  HIGHLIGHT_DEFAULT_SECONDS,
  HIGHLIGHT_FREENET_DEFAULT_SECONDS,
  HIGHLIGHT_DURATION_PRESETS_SEC,
  resolveHighlightDurationSeconds,
  type HighlightComposePayload,
} from '../../lib/mapHighlights';
import { cn } from '../../lib/utils';

type Props = {
  farmId?: string | null;
  role: string | null | undefined;
  farmDefaultSeconds?: number | null;
  sessionName?: string | null;
  sessionId?: string | null;
  presence?: Array<{ uid?: string; displayName?: string | null }>;
  /** Freenet farm — default duration is longer; copy says it syncs by itself. */
  freenetSync?: boolean;
  onCancel: () => void;
  onUndo?: () => void;
  onSend: (opts: HighlightComposePayload) => void;
  busy?: boolean;
};

export function HighlightComposeSheet({
  farmId,
  role,
  farmDefaultSeconds,
  sessionName,
  sessionId,
  presence,
  freenetSync,
  onCancel,
  onUndo,
  onSend,
  busy,
}: Props) {
  const canChoose = role === 'admin' || role === 'farmer';
  const farmDefault = resolveHighlightDurationSeconds({
    role: 'viewer',
    farmDefaultSeconds:
      farmDefaultSeconds ?? (freenetSync ? HIGHLIGHT_FREENET_DEFAULT_SECONDS : undefined),
  });
  const presets = useMemo(() => {
    const set = new Set<number>([farmDefault, ...HIGHLIGHT_DURATION_PRESETS_SEC]);
    return [...set].sort((a, b) => a - b);
  }, [farmDefault]);

  const assignees = useHighlightAssignees({
    farmId,
    sessionName,
    sessionId,
    presence,
    enabled: Boolean(farmId),
  });

  const [note, setNote] = useState('');
  const [durationSeconds, setDurationSeconds] = useState(farmDefault);
  const [assigneeKey, setAssigneeKey] = useState('everyone');
  const [otherName, setOtherName] = useState('');

  const labelFor = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    if (sec % 60 === 0) return `${sec / 60}m`;
    return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  };

  const directedAt = (): Pick<HighlightComposePayload, 'directedAtName' | 'directedAtUid'> => {
    if (assigneeKey === 'everyone') return {};
    if (assigneeKey === 'other') {
      const name = otherName.trim();
      return name ? { directedAtName: name } : {};
    }
    const picked = assignees.find((a) => a.id === assigneeKey);
    if (!picked) return {};
    return { directedAtName: picked.name, directedAtUid: picked.id };
  };

  return (
    <div className="pufam-highlight-compose absolute bottom-24 lg:bottom-10 left-1/2 -translate-x-1/2 z-[1200] w-[calc(100%-1.5rem)] max-w-md pointer-events-auto">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-3 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-slate-900">Check this</p>
            <p className="text-[11px] text-slate-500">
              Timed pulse for the crew. Paint more strokes to grow the zone. A
              note or a name becomes a farm diary task.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50"
            aria-label="Cancel highlight"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <span className="text-[9px] font-bold text-slate-400 uppercase">Directed at</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setAssigneeKey('everyone')}
              className={cn(
                'px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors',
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
                onClick={() => setAssigneeKey(person.id)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors',
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
              onClick={() => setAssigneeKey('other')}
              className={cn(
                'px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors',
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
              onChange={(e) => setOtherName(e.target.value)}
              placeholder="Name"
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
              autoFocus
            />
          )}
        </div>

        <label className="block">
          <span className="text-[9px] font-bold text-slate-400 uppercase">Note (optional)</span>
          <input
            type="text"
            maxLength={280}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Check this valve"
            className="mt-0.5 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
          />
        </label>

        <div>
          <span className="text-[9px] font-bold text-slate-400 uppercase">Duration</span>
          {canChoose ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {presets.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setDurationSeconds(sec)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors',
                    durationSeconds === sec
                      ? 'bg-teal-700 text-white border-teal-700'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-teal-400'
                  )}
                >
                  {labelFor(sec)}
                  {sec === farmDefault ? ' · default' : ''}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs text-slate-600 font-medium">
              {labelFor(farmDefault || HIGHLIGHT_DEFAULT_SECONDS)} (farm default)
            </p>
          )}
        </div>

        {freenetSync && (
          <p className="text-[11px] text-slate-500">
            Freenet copies this by itself. The other device picks it up within about
            twenty seconds if its node is running — pick a duration that lasts that long.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-0.5">
          {onUndo && (
            <button
              type="button"
              onClick={onUndo}
              className="inline-flex items-center justify-center gap-1 min-h-[44px] px-3 py-1.5 text-xs font-semibold text-slate-600 rounded-lg hover:bg-slate-50"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Undo
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] px-3 py-1.5 text-xs font-semibold text-slate-600 rounded-lg hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onSend({
                note: note.trim(),
                durationSeconds: canChoose
                  ? durationSeconds
                  : farmDefault || HIGHLIGHT_DEFAULT_SECONDS,
                ...directedAt(),
              })
            }
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-1.5 bg-teal-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
