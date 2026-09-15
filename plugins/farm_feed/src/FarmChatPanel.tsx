import { useEffect, useRef, useState, type FormEvent } from 'react';
import { cn } from '../../../src/lib/utils';
import type { FarmChatMessage } from './farmChatLog';
import { FARM_CHAT_TEXT_MAX } from './farmChatLog';
import { useFarmChat } from './useFarmChat';

export function FarmChatPanel() {
  const chat = useFarmChat();
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    log.scrollTop = log.scrollHeight;
  }, [chat.messages.length]);

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    const ok = await chat.send(draft);
    if (ok) setDraft('');
  };

  const latency = chat.freenet
    ? 'Not instant — On Opennet + the 20s watch (faster if this device already has a path). Hosted web has no Freenet node.'
    : 'Whole-farm log. Updates when someone sends, or when this screen is open.';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col">
      <header className="px-4 pt-3 pb-2 border-b border-slate-100">
        <h2 className="text-sm font-bold text-slate-900">Farm chat</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Whole farm — last 5 messages. Older lines archive at midnight (Australia/Perth). Not a
          private message.
        </p>
        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{latency}</p>
      </header>

      <div
        ref={logRef}
        data-testid="farm-chat-log"
        className="min-h-[9rem] max-h-[14rem] overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-3"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <ul className="space-y-2">
          {chat.messages.length === 0 ? (
            <li className="text-sm text-slate-500 text-center py-6">
              No farm messages yet. This is the shed chat — everyone on the farm can read it.
            </li>
          ) : (
            chat.messages.map((row) => <FarmChatLine key={row.id} row={row} />)
          )}
        </ul>
      </div>

      <form onSubmit={onSubmit} className="border-t border-slate-100 px-3 py-2 flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(ev) => setDraft(ev.target.value)}
          maxLength={FARM_CHAT_TEXT_MAX}
          disabled={!chat.canCompose || chat.sending || (chat.freenet && !chat.canPublishFreenet)}
          placeholder={
            !chat.canCompose
              ? 'Viewers can read farm chat'
              : chat.freenet && !chat.canPublishFreenet
                ? 'Freenet chat is AppImage / APK only'
                : 'Message the whole farm'
          }
          className="flex-1 min-w-0 rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={
            !chat.canCompose ||
            chat.sending ||
            !draft.trim() ||
            (chat.freenet && !chat.canPublishFreenet)
          }
          className={cn(
            'px-3 py-2 rounded-lg text-xs font-semibold shrink-0',
            'bg-slate-900 text-white disabled:opacity-40'
          )}
        >
          {chat.sending ? 'Sending…' : 'Send'}
        </button>
      </form>
      {chat.error ? (
        <p className="px-4 pb-2 text-[11px] text-amber-800">{chat.error}</p>
      ) : null}
    </section>
  );
}

function FarmChatLine({ row }: { row: FarmChatMessage }) {
  return (
    <li className="text-sm">
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="font-semibold text-slate-800 truncate">{row.authorName}</span>
        <span className="text-[10px] text-slate-400 shrink-0">{formatChatWhen(row.at)}</span>
      </div>
      <p className="text-slate-700 whitespace-pre-wrap break-words">{row.text}</p>
    </li>
  );
}

function formatChatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
