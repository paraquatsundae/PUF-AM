import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  Bug,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Loader2,
  Map,
  MapPin,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useMapStore } from '../lib/mapStore';
import { useFieldStore } from '../lib/fieldStore';
import { useFarmDiary, getDefaultDiaryStartDate } from '../lib/farmDiary';
import { isOpenIssue } from '../lib/blockIssueCounts';
import { getBlightAggregate, isAggregateFresh, type BlightAggregate, type BlightRiskBand } from '../services/aggregateService';
import { bandFromRisk, RISK_BAND_LABEL } from '../lib/jiBlightBands';
import { useWalnutPack } from '../hooks/useWalnutPack';
import { cn } from '../lib/utils';

/**
 * Map the Ji daily infection risk to a grower band. Uses the stored band when
 * present (written by the aggregate) and falls back to deriving it from the
 * score so old aggregate docs still render. Matches the BlightRisk page bands.
 */
function riskMeta(agg: BlightAggregate | null) {
  const band: BlightRiskBand = agg?.currentBand ?? bandFromRisk(agg?.currentRiskScore ?? 0);
  const label = RISK_BAND_LABEL[band];
  switch (band) {
    case 'action':
      return { band, label, color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200' };
    case 'watch':
      return { band, label, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' };
    default:
      return { band, label, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' };
  }
}

export function Dashboard() {
  const { userData, hasModule } = useAuth();
  const farmId = userData?.farmId;
  const { blocks } = useMapStore();
  const fieldIssues = useFieldStore((s) => s.issues);
  const loadFieldData = useFieldStore((s) => s.loadData);
  const { events } = useFarmDiary(getDefaultDiaryStartDate(90));
  const hasWalnutPack = useWalnutPack();
  const showBlight = hasWalnutPack && hasModule('blight');

  const [blightAggregate, setBlightAggregate] = useState<BlightAggregate | null>(null);
  const [blightLoading, setBlightLoading] = useState(true);

  useEffect(() => {
    if (farmId) loadFieldData(farmId);
  }, [farmId, loadFieldData]);

  useEffect(() => {
    if (!farmId || !showBlight) {
      setBlightAggregate(null);
      setBlightLoading(false);
      return;
    }
    let cancelled = false;
    setBlightLoading(true);
    getBlightAggregate(farmId)
      .then((agg) => {
        if (!cancelled && agg) setBlightAggregate(agg);
      })
      .finally(() => {
        if (!cancelled) setBlightLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [farmId, showBlight]);

  const openIssues = useMemo(
    () =>
      [...fieldIssues.filter(isOpenIssue)].sort((a, b) =>
        b.reportedAt.localeCompare(a.reportedAt)
      ),
    [fieldIssues]
  );

  const openPlans = useMemo(
    () =>
      events
        .filter((e) => e.type === 'work' && (e.status ?? 'planned') === 'planned')
        .sort((a, b) => a.date.localeCompare(b.date)),
    [events]
  );

  const threat = blightAggregate?.currentRiskScore ?? 0;
  const risk = riskMeta(blightAggregate);
  const blightFresh = blightAggregate
    ? isAggregateFresh(blightAggregate.lastUpdated)
    : false;

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <header>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{todayLabel}</p>
        <h1 className="text-2xl font-bold text-slate-900 mt-0.5">Farm home</h1>
        <p className="text-sm text-slate-500 mt-1">
          {showBlight
            ? 'Map → issues → diary plans. Blight and seasonal logs sit beside that loop.'
            : 'Map → issues → diary plans. Seasonal logs sit beside that loop.'}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          {blocks.length} {blocks.length === 1 ? 'block' : 'blocks'}
          {openIssues.length > 0 && (
            <>
              {' · '}
              <span className="text-amber-700 font-medium">
                {openIssues.length} open {openIssues.length === 1 ? 'issue' : 'issues'}
              </span>
            </>
          )}
        </p>
      </header>

      {/* Primary field actions */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link
          to="/map"
          className="group flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-400 hover:shadow-md transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center">
            <Map className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 group-hover:underline">Farm map</div>
            <p className="text-xs text-slate-500 mt-0.5">Drop pins · view areas</p>
          </div>
        </Link>

        <Link
          to="/diary"
          className="group flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-400 hover:shadow-md transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 group-hover:underline">Farm diary</div>
            <p className="text-xs text-slate-500 mt-0.5">
              {openPlans.length > 0
                ? `${openPlans.length} open ${openPlans.length === 1 ? 'plan' : 'plans'}`
                : 'Plan & log work'}
            </p>
          </div>
        </Link>

        <Link
          to="/diary?view=issues"
          className={cn(
            'group flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm hover:shadow-md transition-all',
            openIssues.length > 0
              ? 'border-amber-300 hover:border-amber-500'
              : 'border-slate-200 hover:border-slate-400'
          )}
        >
          <div
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center',
              openIssues.length > 0 ? 'bg-amber-500 text-white' : 'bg-slate-900 text-white'
            )}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 group-hover:underline">
              Issues
              {openIssues.length > 0 && (
                <span className="ml-1.5 text-amber-700 tabular-nums">({openIssues.length})</span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {openIssues.length === 0 ? 'Nothing open' : 'Triage & create plans'}
            </p>
          </div>
        </Link>
      </section>

      {showBlight && (
        <Link
          to="/blight"
          className={cn(
            'flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors',
            risk.bg,
            risk.border,
            'hover:opacity-95'
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <Bug className={cn('w-5 h-5 shrink-0', risk.color)} />
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Blight risk
              </div>
              {blightLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-400 mt-1" />
              ) : blightAggregate ? (
                <div className={cn('text-sm font-bold', risk.color)}>
                  {risk.label}
                  <span className="font-mono font-medium text-slate-600 ml-2">
                    {threat < 0.001 ? threat.toExponential(1) : threat.toFixed(3)}
                  </span>
                  {!blightFresh && (
                    <span className="ml-2 text-[10px] font-medium text-amber-700">stale</span>
                  )}
                </div>
              ) : (
                <div className="text-sm text-slate-500">Open blight page for detail</div>
              )}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </Link>
      )}

      {/* Open issues queue */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">Open issues</h2>
          <Link
            to="/diary?view=issues"
            className="text-xs font-semibold text-slate-500 hover:text-slate-900"
          >
            All issues
          </Link>
        </div>
        {openIssues.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            No open issues. Report from the map when you spot something.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {openIssues.slice(0, 5).map((issue) => (
              <li key={issue.id}>
                <Link
                  to={`/map?issue=${encodeURIComponent(issue.id)}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {issue.note ||
                        issue.category.charAt(0).toUpperCase() + issue.category.slice(1)}
                    </div>
                    <div className="text-[11px] text-slate-400 capitalize">
                      {issue.priority}
                      {issue.status === 'in-progress' ? ' · in progress' : ''}
                    </div>
                  </div>
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Upcoming plans */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">Open plans</h2>
          <Link to="/diary" className="text-xs font-semibold text-slate-500 hover:text-slate-900">
            Diary
          </Link>
        </div>
        {openPlans.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            No planned work. Create a plan from the diary or an issue.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {openPlans.slice(0, 5).map((plan) => (
              <li key={plan.id} className="flex items-center gap-3 px-4 py-3">
                <ClipboardList className="w-4 h-4 text-slate-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {plan.title || 'Planned work'}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {plan.date}
                    {plan.assignedToName ? ` · ${plan.assignedToName}` : ''}
                    {plan.linkedIssueId ? ' · linked issue' : ''}
                  </div>
                </div>
                {plan.safetyChecklistAccepted ? (
                  <CheckCircle2
                    className="w-4 h-4 text-emerald-600 shrink-0"
                    aria-label="Safety accepted"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
