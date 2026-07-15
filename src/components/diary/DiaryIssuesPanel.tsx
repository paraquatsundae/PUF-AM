import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, MapPin, ClipboardList, Search, X } from 'lucide-react';
import type { FieldIssue } from '../../lib/fieldStore';
import type { OrchardBlock } from '../../lib/mapStore';
import { isOpenIssue, issuesForBlock } from '../../lib/blockIssueCounts';
import { cn } from '../../lib/utils';

type Props = {
  blocks: OrchardBlock[];
  issues: FieldIssue[];
  canEdit: boolean;
  onResolve: (issue: FieldIssue) => void;
  onCreatePlan: (issue: FieldIssue, blockId: string | undefined) => void;
};

function priorityClass(priority: FieldIssue['priority']) {
  if (priority === 'high') return 'bg-red-100 text-red-700';
  if (priority === 'medium') return 'bg-orange-100 text-orange-700';
  return 'bg-yellow-100 text-yellow-800';
}

function categoryLabel(category: FieldIssue['category']) {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export function DiaryIssuesPanel({
  blocks,
  issues,
  canEdit,
  onResolve,
  onCreatePlan,
}: Props) {
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | FieldIssue['priority']>('all');

  const { groups, totalOpen } = useMemo(() => {
    const open = issues.filter(isOpenIssue);
    const q = search.trim().toLowerCase();
    const filtered = open.filter((issue) => {
      if (priorityFilter !== 'all' && issue.priority !== priorityFilter) return false;
      if (!q) return true;
      return (
        issue.category.includes(q) ||
        issue.note?.toLowerCase().includes(q) ||
        issue.priority.includes(q)
      );
    });

    const assigned = new Set<string>();
    const byBlock: { blockId: string; blockName: string; issues: FieldIssue[] }[] = [];

    for (const block of blocks) {
      const inBlock = issuesForBlock(block, filtered);
      if (inBlock.length === 0) continue;
      inBlock.forEach((i) => assigned.add(i.id));
      byBlock.push({
        blockId: block.id,
        blockName: block.name || 'Unnamed block',
        issues: [...inBlock].sort((a, b) => b.reportedAt.localeCompare(a.reportedAt)),
      });
    }

    byBlock.sort((a, b) => a.blockName.localeCompare(b.blockName));

    const unassigned = filtered
      .filter((i) => !assigned.has(i.id))
      .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));

    if (unassigned.length > 0) {
      byBlock.push({
        blockId: 'unassigned',
        blockName: 'Outside block boundaries',
        issues: unassigned,
      });
    }

    return { groups: byBlock, totalOpen: open.length };
  }, [blocks, issues, search, priorityFilter]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-900">
            {totalOpen === 0 ? 'No open issues' : `${totalOpen} open`}
          </p>
          <p className="text-xs text-slate-500">
            Drop flags on the orchard map · triage and plan work here
          </p>
        </div>
        <Link
          to="/map"
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold uppercase tracking-wider hover:bg-slate-800"
        >
          <MapPin className="w-3.5 h-3.5" />
          Open map
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search issues…"
            className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-400"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-100 rounded-full"
            >
              <X className="w-3 h-3 text-slate-400" />
            </button>
          )}
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
          {(['all', 'high', 'medium', 'low'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriorityFilter(p)}
              className={cn(
                'px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg capitalize',
                priorityFilter === p
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-500">
          {search || priorityFilter !== 'all'
            ? 'No matching issues.'
            : 'Nothing open. Report issues from the map when you spot them in the orchard.'}
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.blockId} className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-base font-bold text-slate-900">{group.blockName}</h2>
                <span className="text-xs text-slate-500">
                  {group.issues.length} {group.issues.length === 1 ? 'issue' : 'issues'}
                </span>
              </div>
              <ul className="space-y-2">
                {group.issues.map((issue) => (
                  <li
                    key={issue.id}
                    className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">
                            {issue.note || categoryLabel(issue.category)}
                          </span>
                          <span
                            className={cn(
                              'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                              priorityClass(issue.priority)
                            )}
                          >
                            {issue.priority}
                          </span>
                          {issue.status === 'in-progress' && (
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">
                              In progress
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 capitalize">
                          {issue.priority} · {categoryLabel(issue.category)} · reported{' '}
                          {new Date(issue.reportedAt).toLocaleString()}
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Link
                            to={`/map?issue=${encodeURIComponent(issue.id)}`}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50"
                          >
                            <MapPin className="w-3.5 h-3.5" />
                            View on map
                          </Link>
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  onCreatePlan(
                                    issue,
                                    group.blockId === 'unassigned' ? undefined : group.blockId
                                  )
                                }
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold uppercase tracking-wider hover:bg-slate-800"
                              >
                                <ClipboardList className="w-3.5 h-3.5" />
                                Create plan
                              </button>
                              <button
                                type="button"
                                onClick={() => onResolve(issue)}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold uppercase tracking-wider text-emerald-700 hover:bg-emerald-50"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Resolve
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
