import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BookOpen, MapPin } from 'lucide-react';
import { cn } from '../../../src/lib/utils';
import type { FarmFeedItem } from './farmFeedDerive';
import { useFarmFeed } from './useFarmFeed';
import { useFarmFeedPack } from './useFarmFeedPack';

export function FarmFeedPage() {
  const show = useFarmFeedPack();
  const feed = useFarmFeed({ hydrate: true });
  const [filter, setFilter] = useState<'all' | 'forYou'>('all');

  useEffect(() => {
    if (show) feed.markSeen();
    // Mark once when the screen opens — not on every item tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  if (!show) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-3">
        <h1 className="text-2xl font-bold text-slate-900">Farm feed</h1>
        <p className="text-sm text-slate-600">
          Farm feed is not active on this farm. An admin can Install it under Settings → Plugins →
          General.
        </p>
      </div>
    );
  }

  const rows = filter === 'forYou' ? feed.forYou : feed.items;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Farm feed</h1>
        <p className="text-sm text-slate-500 mt-1">
          Issues, check-this highlights, and diary already on this farm. Empty Directed at is
          Everyone.
        </p>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
          {feed.freenetPipe
            ? 'Updates when this device’s node is On Opennet and the 20s watch runs — not an instant message. Hosted web has no Freenet node.'
            : 'Uses issues, highlights, and diary this farm already syncs. No extra chat store. Freenet feed is AppImage / APK only.'}
        </p>
      </header>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-semibold border',
            filter === 'all'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-200'
          )}
        >
          All farm ({feed.items.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('forYou')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-semibold border',
            filter === 'forYou'
              ? 'bg-teal-700 text-white border-teal-700'
              : 'bg-white text-slate-700 border-slate-200'
          )}
        >
          For you ({feed.forYou.length})
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center">
          {filter === 'forYou'
            ? 'Nothing directed at you yet. Direct an issue or highlight at a person, or leave Directed at empty for Everyone.'
            : 'Nothing in the feed yet. Report an issue or send a check-this from the map.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((item) => (
            <FarmFeedCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FarmFeedCard({ item }: { item: FarmFeedItem }) {
  const Icon = item.kind === 'issue' ? AlertTriangle : item.kind === 'diary' ? BookOpen : MapPin;
  return (
    <li>
      <Link
        to={item.href}
        className="flex gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:border-slate-400"
      >
        {item.photoSrc ? (
          <img
            src={item.photoSrc}
            alt=""
            className="w-14 h-14 rounded-xl object-cover shrink-0 bg-slate-100"
          />
        ) : (
          <Icon className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {item.kind}
            </span>
            {item.forYou ? (
              <span className="text-[10px] font-bold uppercase tracking-wide text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded">
                For you
              </span>
            ) : item.everyone ? (
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Everyone
              </span>
            ) : item.directedAtName ? (
              <span className="text-[10px] font-semibold text-slate-500">For {item.directedAtName}</span>
            ) : null}
          </div>
          <p className="text-sm font-semibold text-slate-900 truncate mt-0.5">{item.title}</p>
          {item.body ? <p className="text-[11px] text-slate-500 truncate">{item.body}</p> : null}
        </div>
      </Link>
    </li>
  );
}
