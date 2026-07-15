import { useState } from 'react';
import { ArrowDownUp, Loader2, MapPin, X } from 'lucide-react';
import type { FieldIssue } from '../../lib/fieldStore';
import { COMMON_ISSUE_PRESETS } from '../../lib/issuePresets';
import { cn } from '../../lib/utils';

type Dock = 'top' | 'bottom';

type Props = {
  location: { lat: number; lng: number };
  blockName?: string;
  onCancel: () => void;
  onSave: (data: {
    category: FieldIssue['category'];
    priority: FieldIssue['priority'];
    note: string;
  }) => Promise<void>;
};

export function ReportIssueSheet({ location: _location, blockName, onCancel, onSave }: Props) {
  const [customText, setCustomText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dock, setDock] = useState<Dock>('top');

  const commit = async (data: {
    category: FieldIssue['category'];
    priority: FieldIssue['priority'];
    note: string;
  }) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save issue');
      setSaving(false);
    }
  };

  const handlePreset = (preset: (typeof COMMON_ISSUE_PRESETS)[number]) => {
    void commit({
      category: preset.category,
      priority: preset.priority,
      note: preset.label,
    });
  };

  const handleCustom = () => {
    const note = customText.trim();
    if (!note) return;
    void commit({
      category: 'other',
      priority: 'medium',
      note,
    });
  };

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 z-[1200] flex justify-center px-3',
        dock === 'top' ? 'top-3 sm:top-4' : 'bottom-3 sm:bottom-6'
      )}
    >
      <div
        className={cn(
          'pointer-events-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white/95 backdrop-blur shadow-2xl',
          'max-h-[min(42vh,360px)] flex flex-col overflow-hidden'
        )}
      >
        <div className="flex items-start justify-between gap-2 px-3.5 pt-3 pb-2 shrink-0 border-b border-slate-100">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900">What&apos;s the issue?</h3>
            <p className="text-[11px] text-slate-500 mt-0.5 inline-flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">
                {blockName ? `${blockName} · ` : ''}
                pin on map — pick a type
              </span>
            </p>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setDock((d) => (d === 'top' ? 'bottom' : 'top'))}
              disabled={saving}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title={dock === 'top' ? 'Move menu to bottom' : 'Move menu to top'}
              aria-label="Move menu"
            >
              <ArrowDownUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-50"
              aria-label="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-3.5 py-3 space-y-3 overflow-y-auto min-h-0">
          <div className="grid grid-cols-3 gap-1.5">
            {COMMON_ISSUE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={saving}
                onClick={() => handlePreset(preset)}
                className={cn(
                  'text-left px-2 py-2 rounded-lg border text-[11px] sm:text-xs font-medium leading-snug transition-colors',
                  'border-slate-200 bg-white text-slate-800 hover:border-amber-400 hover:bg-amber-50',
                  'disabled:opacity-50 active:scale-[0.98]'
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCustom();
                }
              }}
              disabled={saving}
              placeholder="Custom issue…"
              className="flex-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 disabled:opacity-50"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={handleCustom}
              disabled={saving || !customText.trim()}
              className="shrink-0 px-3 py-2 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
            </button>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="w-full py-1 text-[11px] font-medium text-slate-500 hover:text-slate-700"
          >
            Reposition pin
          </button>
        </div>
      </div>
    </div>
  );
}
