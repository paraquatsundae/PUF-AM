import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ShieldCheck, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { DiaryEvent } from '../../lib/farmDiary';
import { cn } from '../../lib/utils';

type Props = {
  event: DiaryEvent;
  canEdit: boolean;
  deleteConfirmId: string | null;
  onAskDelete: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (event: DiaryEvent) => void;
  onAcceptSafety: (id: string) => void;
  onMarkDone: (event: DiaryEvent) => void;
  onCancelPlan: (event: DiaryEvent) => void;
  onUnlinkIssue: (event: DiaryEvent) => void;
};

function eventTitle(event: DiaryEvent): string {
  if (event.type === 'spray') {
    return event.agentName ? `Applied ${event.agentName}` : `${event.sprayType} application`;
  }
  if (event.type === 'irrigation') return 'Irrigation Event';
  if (event.type === 'nutrition') {
    return event.productName ? `Applied ${event.productName}` : 'Nutrition application';
  }
  return event.title || 'Planned work';
}

function applicationMethodLabel(method: DiaryEvent['applicationMethod']): string {
  if (method === 'ground') return 'Ground Sprayer';
  if (method === 'drone') return 'Drone';
  if (method === 'helicopter') return 'Helicopter';
  return 'Aeroplane';
}

export function DiaryTimelineEventCard({
  event,
  canEdit,
  deleteConfirmId,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
  onAcceptSafety,
  onMarkDone,
  onCancelPlan,
  onUnlinkIssue,
}: Props) {
  const status = event.status ?? 'planned';

  return (
    <div className="relative group">
      <div className="absolute -left-[45px] top-4 w-2 h-2 rounded-full bg-slate-300 border-2 border-white z-10 group-hover:bg-slate-900 group-hover:scale-125 transition-all" />

      <div className="mb-2">
        <span className="font-serif italic text-xs text-slate-500">
          {new Date(event.date).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      </div>

      <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 group-hover:border-slate-300">
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 px-2 py-1 rounded">
            {new Date(event.date + 'T12:00:00').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ===
            '12:00 PM'
              ? 'Daily Entry'
              : 'Timed Entry'}
          </span>

          <div className="flex items-center gap-1">
            <AnimatePresence mode="wait">
              {deleteConfirmId === event.id ? (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="flex items-center gap-2"
                >
                  <span className="text-[10px] font-bold text-rose-600 uppercase tracking-widest">Confirm?</span>
                  <button
                    type="button"
                    onClick={() => onConfirmDelete(event)}
                    className="p-1.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={onCancelDelete}
                    className="p-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              ) : (
                canEdit && (
                  <button
                    type="button"
                    onClick={() => onAskDelete(event.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-bold text-lg text-slate-900 tracking-tight">{eventTitle(event)}</h3>
          {event.type === 'work' && (
            <span
              className={cn(
                'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
                status === 'planned'
                  ? 'bg-amber-100 text-amber-800'
                  : status === 'cancelled'
                    ? 'bg-slate-100 text-slate-500'
                    : 'bg-emerald-100 text-emerald-800'
              )}
            >
              {status === 'planned' ? 'Plan' : status}
            </span>
          )}
        </div>

        {event.type === 'work' && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
            <div className="flex flex-wrap gap-3 text-xs text-slate-600">
              {event.assignedToName && (
                <span>
                  Assigned: <strong className="text-slate-900">{event.assignedToName}</strong>
                </span>
              )}
              {event.priority && (
                <span className="capitalize">
                  Priority: <strong className="text-slate-900">{event.priority}</strong>
                </span>
              )}
              {event.safetyChecklistAccepted && (
                <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Safety accepted
                </span>
              )}
              {event.linkedIssueId && (
                <Link
                  to={`/map?issue=${encodeURIComponent(event.linkedIssueId)}`}
                  className="inline-flex items-center gap-1 text-amber-700 font-medium hover:underline"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  View on map
                </Link>
              )}
            </div>
            {event.notes && <p className="text-sm text-slate-600">{event.notes}</p>}
            {canEdit && status === 'planned' && (
              <div className="flex flex-wrap gap-2">
                {!event.safetyChecklistAccepted ? (
                  <button
                    type="button"
                    onClick={() => onAcceptSafety(event.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-emerald-700"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Accept & start
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onMarkDone(event)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold uppercase tracking-wider hover:bg-slate-800"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Mark done
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onCancelPlan(event)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50"
                >
                  Cancel plan
                </button>
                {event.linkedIssueId && (
                  <button
                    type="button"
                    onClick={() => onUnlinkIssue(event)}
                    className="px-3 py-2 rounded-xl border border-amber-200 text-xs font-bold uppercase tracking-wider text-amber-800 hover:bg-amber-50"
                  >
                    Unlink issue
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {event.type === 'irrigation' && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-baseline gap-4">
            <span className="font-mono text-3xl font-bold tracking-tighter text-blue-600">
              {event.irrigationAmount}
              <span className="text-[10px] ml-1.5 font-bold text-slate-400 uppercase tracking-widest">mm depth</span>
            </span>
            {event.durationMinutes && (
              <span className="text-xs font-medium text-slate-500">{event.durationMinutes} mins</span>
            )}
          </div>
        )}

        {event.type === 'nutrition' && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
            <div className="flex flex-wrap items-baseline gap-3">
              {event.rate != null && (
                <span className="font-mono text-2xl font-bold tracking-tighter text-emerald-600">
                  {event.rate}
                  <span className="text-[10px] ml-1.5 font-bold text-slate-400 uppercase tracking-widest">
                    {event.rateUnit || ''}
                  </span>
                </span>
              )}
              {(event.nRate != null || event.pRate != null || event.kRate != null) && (
                <span className="text-xs font-medium text-slate-600">
                  {[
                    event.nRate != null ? `N ${event.nRate}` : null,
                    event.pRate != null ? `P ${event.pRate}` : null,
                    event.kRate != null ? `K ${event.kRate}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  <span className="text-slate-400 ml-1">kg/ha</span>
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {event.nutritionMethod && (
                <span className="px-2.5 py-1 text-[10px] font-bold uppercase rounded-full border bg-emerald-50 border-emerald-100 text-emerald-700">
                  {event.nutritionMethod}
                </span>
              )}
            </div>
          </div>
        )}

        {event.type === 'spray' && (
          <div className="mt-3 flex flex-wrap gap-2">
            <span
              className={cn(
                'px-2.5 py-1 text-[10px] font-bold uppercase rounded-full border',
                event.sprayType === 'chem'
                  ? 'bg-orange-50 border-orange-100 text-orange-600'
                  : 'bg-emerald-50 border-emerald-100 text-emerald-600'
              )}
            >
              {event.sprayType === 'chem' ? 'Synthetic Agent' : 'Biological Agent'}
            </span>
            {event.applicationMethod && (
              <span className="px-2.5 py-1 text-[10px] font-bold uppercase rounded-full border bg-slate-50 border-slate-200 text-slate-600">
                {applicationMethodLabel(event.applicationMethod)}
              </span>
            )}
            {event.carrier && (
              <span className="px-2.5 py-1 text-[10px] font-bold uppercase rounded-full border bg-blue-50 border-blue-100 text-blue-600">
                Carrier: {event.carrier}
              </span>
            )}
            {event.adjuvant && event.adjuvant !== 'None' && (
              <span className="px-2.5 py-1 text-[10px] font-bold uppercase rounded-full border bg-purple-50 border-purple-100 text-purple-600">
                Adjuvant: {event.adjuvant}
              </span>
            )}
          </div>
        )}

        {event.notes && event.type !== 'work' && (
          <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-xs text-slate-600 leading-relaxed">{event.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
