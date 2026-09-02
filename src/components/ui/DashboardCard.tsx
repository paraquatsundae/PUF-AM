/**
 * The Farm home summary-card shell.
 *
 * Core owns the chrome so every pack's card looks the same; the pack owns the
 * body, because only it knows what its number means. Packs pick a tone rather
 * than passing classes — one palette, no drift.
 */
import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

export type DashboardCardTone = 'info' | 'ok' | 'watch' | 'alert';

const TONE: Record<DashboardCardTone, { bg: string; border: string; text: string }> = {
  info: { bg: 'bg-sky-50/80', border: 'border-sky-200', text: 'text-sky-600' },
  ok: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  watch: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
  alert: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700' },
};

/** The tone's text colour, for a body that wants to match its own card. */
export function dashboardToneText(tone: DashboardCardTone): string {
  return TONE[tone].text;
}

export function DashboardCard({
  href,
  label,
  icon: Icon,
  tone,
  children,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  tone: DashboardCardTone;
  children: React.ReactNode;
}) {
  const palette = TONE[tone];

  return (
    <Link
      to={href}
      className={cn(
        'flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors hover:opacity-95',
        palette.bg,
        palette.border
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Icon className={cn('w-5 h-5 shrink-0', palette.text)} />
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {label}
          </div>
          {children}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
    </Link>
  );
}
