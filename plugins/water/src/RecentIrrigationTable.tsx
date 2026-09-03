import { Link } from 'react-router-dom';
import { Activity } from 'lucide-react';

export function RecentIrrigationTable({
  events,
}: {
  events: {
    date: string;
    irrigationAmount?: number;
    durationMinutes?: number;
    notes?: string;
  }[];
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-sky-600" />
          Recent irrigation
        </h2>
        <Link to="/diary" className="text-[11px] font-semibold text-sky-700 hover:text-sky-900">
          All in diary
        </Link>
      </div>
      {events.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-slate-400">No irrigation logged yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[9px] font-bold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Block</th>
                <th className="px-3 py-2 text-right">mm</th>
                <th className="px-3 py-2 text-right">Hours</th>
                <th className="px-3 py-2 hidden sm:table-cell">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {events.map((event, idx) => (
                <tr key={`${event.date}-${idx}`} className="text-slate-700">
                  <td className="px-3 py-2 font-medium whitespace-nowrap">
                    {new Date(event.date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}
                  </td>
                  <td className="px-3 py-2 truncate max-w-[120px]">
                    {event.notes?.split('Irrigated ')[1]?.split(' via')[0] || '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-sky-700">
                    {event.irrigationAmount || 0}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-500">
                    {Math.round((event.durationMinutes || 0) / 60)}
                  </td>
                  <td className="px-3 py-2 text-slate-400 truncate max-w-[200px] hidden sm:table-cell">
                    {event.notes || ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
