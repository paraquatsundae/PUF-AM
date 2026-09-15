import { useEffect } from 'react';
import { Download } from 'lucide-react';
import { useFarmChatLogs } from './useFarmChatLogs';

/** Settings → General, farm admin only. Crew must not see this card. */
export function FarmChatLogsCard() {
  const logs = useFarmChatLogs();

  useEffect(() => {
    if (logs.visible) void logs.refresh();
    // Load once when an admin opens Settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs.visible]);

  if (!logs.visible) return null;

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
      <h2 className="text-lg font-bold text-slate-900">Download chat logs</h2>
      <p className="text-sm text-slate-600 leading-relaxed">
        Each calendar day (Australia/Perth) is archived, compressed, and sealed with the farm’s
        Hot-style key. Crew cannot see this card.
      </p>
      {logs.days.length === 0 ? (
        <p className="text-sm text-slate-500">
          {logs.loading ? 'Looking up archived days…' : 'No archived days yet. Yesterday’s chat is sealed after midnight.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {logs.days.map((row) => (
            <li key={row.date} className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-slate-800 tabular-nums">{row.date}</span>
              <button
                type="button"
                disabled={logs.loading}
                onClick={() => void logs.download(row.date)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </button>
            </li>
          ))}
        </ul>
      )}
      {logs.error ? <p className="text-[11px] text-amber-800">{logs.error}</p> : null}
    </div>
  );
}
