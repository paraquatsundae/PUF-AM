/**
 * After painting a “check this” area — note, who it’s for, duration, then send.
 */
import React, { useState } from 'react';
import { Send, Undo2, X } from 'lucide-react';
import { useHighlightAssignees } from '../../hooks/useHighlightAssignees';
import {
  HIGHLIGHT_CUSTOM_HOURS_MAX,
  HIGHLIGHT_CUSTOM_HOURS_MIN,
  HIGHLIGHT_DEFAULT_SECONDS,
  HIGHLIGHT_DURATION_PRESET_LABELS,
  HIGHLIGHT_DURATION_PRESETS_SEC,
  HIGHLIGHT_FREENET_DEFAULT_SECONDS,
  HIGHLIGHT_MIN_CUSTOM_SECONDS,
  highlightCustomHoursError,
  highlightCustomHoursToSeconds,
  isHighlightDurationPreset,
  parseHighlightCustomHours,
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

  const assignees = useHighlightAssignees({
    farmId,
    sessionName,
    sessionId,
    presence,
    enabled: Boolean(farmId),
  });

  const [note, setNote] = useState('');
  const [durationMode, setDurationMode] = useState<'preset' | 'custom'>(() =>
    isHighlightDurationPreset(farmDefault)
      ? 'preset'
      : farmDefault >= HIGHLIGHT_MIN_CUSTOM_SECONDS
        ? 'custom'
        : 'preset'
  );
  const [durationSeconds, setDurationSeconds] = useState(farmDefault);
  const [customHours, setCustomHours] = useState(() =>
    !isHighlightDurationPreset(farmDefault) && farmDefault >= HIGHLIGHT_MIN_CUSTOM_SECONDS
      ? String(farmDefault / 3600)
      : ''
  );
  const [assigneeKey, setAssigneeKey] = useState('everyone');
  const [otherName, setOtherName] = useState('');

  const customHoursParsed = parseHighlightCustomHours(customHours);
  const customHoursMessage = highlightCustomHoursError(customHours);
  const chosenSeconds =
    durationMode === 'custom'
      ? customHoursParsed == null
        ? null
        : highlightCustomHoursToSeconds(customHoursParsed)
      : durationSeconds;
  const sendBlocked = Boolean(busy || (canChoose && durationMode === 'custom' && chosenSeconds == null));

  const labelFor = (sec: number) => {
    const preset = HIGHLIGHT_DURATION_PRESET_LABELS[sec];
    if (preset) return preset;
    if (sec < 60) return `${sec}s`;
    if (sec % 3600 === 0) return `${sec / 3600} hour${sec === 3600 ? '' : 's'}`;
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
            <>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {HIGHLIGHT_DURATION_PRESETS_SEC.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => {
                      setDurationMode('preset');
                      setDurationSeconds(sec);
                    }}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors',
                      durationMode === 'preset' && durationSeconds === sec
                        ? 'bg-teal-700 text-white border-teal-700'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-teal-400'
                    )}
                  >
                    {labelFor(sec)}
                    {sec === farmDefault ? ' · default' : ''}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setDurationMode('custom')}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors',
                    durationMode === 'custom'
                      ? 'bg-teal-700 text-white border-teal-700'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-teal-400'
                  )}
                >
                  Custom
                </button>
              </div>
              {durationMode === 'custom' && (
                <div className="mt-1.5">
                  <label className="block">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">
                      Hours
                    </span>
                    <input
                      id="highlight-custom-hours"
                      type="number"
                      inputMode="decimal"
                      min={HIGHLIGHT_CUSTOM_HOURS_MIN}
                      max={HIGHLIGHT_CUSTOM_HOURS_MAX}
                      step="any"
                      value={customHours}
                      onChange={(e) => setCustomHours(e.target.value)}
                      placeholder={`${HIGHLIGHT_CUSTOM_HOURS_MIN}–${HIGHLIGHT_CUSTOM_HOURS_MAX}`}
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
                    />
                  </label>
                  <p
                    className={cn(
                      'mt-1 text-[11px]',
                      customHours.trim() && customHoursMessage ? 'text-rose-600' : 'text-slate-500'
                    )}
                  >
                    {customHours.trim() && customHoursMessage
                      ? customHoursMessage
                      : '0.1–400 hours (6 minutes minimum). Decimal hours allowed.'}
                  </p>
                </div>
              )}
            </>
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
            disabled={sendBlocked}
            onClick={() => {
              const seconds = canChoose
                ? chosenSeconds
                : farmDefault || HIGHLIGHT_DEFAULT_SECONDS;
              if (seconds == null || seconds <= 0) return;
              onSend({
                note: note.trim(),
                durationSeconds: seconds,
                ...directedAt(),
              });
            }}
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
