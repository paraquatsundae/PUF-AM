/**
 * Stable “check this” card — stays until dismiss, not tied to the pulse TTL.
 */
import { useNavigate } from 'react-router-dom';
import { BookOpen, X } from 'lucide-react';
import { highlightDiaryPath } from '../../lib/highlightDiary';
import { isHighlightActive, type MapHighlightDoc } from '../../lib/mapHighlights';

type Props = {
  highlight: MapHighlightDoc;
  canDelete: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
};

export function HighlightInspectSheet({ highlight, canDelete, onClose, onDelete }: Props) {
  const navigate = useNavigate();
  const note = highlight.note?.trim();
  const directed = highlight.directedAtName?.trim();
  const diaryId = highlight.linkedDiaryEventId;
  const pulseLive = isHighlightActive(highlight.expiresAt);

  const openDiary = () => {
    if (!diaryId) return;
    navigate(highlightDiaryPath(diaryId));
  };

  return (
    <div className="absolute bottom-24 lg:bottom-10 left-1/2 -translate-x-1/2 z-[1200] w-[calc(100%-1.5rem)] max-w-md pointer-events-auto">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-3 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-slate-900">
              {(highlight.displayName || 'Crew').slice(0, 100)}
            </p>
            <p className="text-[11px] text-slate-500">
              {pulseLive
                ? `Pulse until ${new Date(highlight.expiresAt).toLocaleTimeString()}`
                : 'Pulse ended — this note stays until you close it'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50"
            aria-label="Close highlight"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {directed && (
          <p className="text-xs font-semibold text-teal-800">
            For {directed}
          </p>
        )}

        {note ? (
          <button
            type="button"
            onClick={diaryId ? openDiary : undefined}
            className={`w-full text-left text-sm text-slate-700 rounded-lg px-2.5 py-2 ${
              diaryId ? 'bg-teal-50 hover:bg-teal-100 cursor-pointer' : 'bg-slate-50'
            }`}
          >
            {note}
            {diaryId && (
              <span className="mt-1 block text-[11px] font-semibold text-teal-700">
                Open in farm diary
              </span>
            )}
          </button>
        ) : (
          <p className="text-xs text-slate-500">No instructions with this pulse.</p>
        )}

        <div className="flex justify-end gap-2 pt-0.5">
          {canDelete && (
            <button
              type="button"
              onClick={() => {
                onDelete(highlight.id);
                onClose();
              }}
              className="px-3 py-1.5 text-xs font-semibold text-rose-700 rounded-lg hover:bg-rose-50"
            >
              Remove
            </button>
          )}
          {diaryId && (
            <button
              type="button"
              onClick={openDiary}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-700 text-white rounded-lg text-xs font-semibold"
            >
              <BookOpen className="w-3.5 h-3.5" />
              Farm diary
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
