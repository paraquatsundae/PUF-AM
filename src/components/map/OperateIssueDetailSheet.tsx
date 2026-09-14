import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { FieldIssue } from '../../lib/fieldStore';
import { getIssuePhotoCache } from '../../lib/issuePhotoCache';
import { isFreenetFarm } from '../../lib/farmPipes';
import { listIssuePhotoRefs } from '../../lib/farmPhoto';
import { IssuePhotoField } from './IssuePhotoField';

function photoStatusCopy(issue: FieldIssue): string | null {
  if (issue.photoStatus === 'uploading') {
    return isFreenetFarm()
      ? 'Sending this photo over Freenet…'
      : 'Uploading photo…';
  }
  if (issue.photoStatus === 'failed') {
    return issue.photoError || (isFreenetFarm()
      ? 'Photo did not reach Freenet.'
      : 'Photo upload failed.');
  }
  return null;
}

export function OperateIssueDetailSheet({
  issue,
  farmId,
  canResolve,
  onClose,
  onResolve,
}: {
  issue: FieldIssue;
  farmId?: string;
  canResolve: boolean;
  onClose: () => void;
  onResolve: () => void;
}) {
  const { userData } = useAuth();
  const uid = userData?.uid;
  const refs = listIssuePhotoRefs(issue);
  const [localSrc, setLocalSrc] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    if (!farmId) {
      setLocalSrc({});
      return;
    }
    void Promise.all(
      refs.map(async (photo) => {
        if (photo.url) return [photo.id, photo.url] as const;
        const row = await getIssuePhotoCache(farmId, issue.id, photo.id);
        if (!row) return null;
        const url = URL.createObjectURL(row.blob);
        urls.push(url);
        return [photo.id, url] as const;
      }),
    ).then((pairs) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const pair of pairs) {
        if (pair) next[pair[0]] = pair[1];
      }
      if (issue.photoData && refs.length === 0) next.legacy = issue.photoData;
      setLocalSrc(next);
    });
    return () => {
      cancelled = true;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [farmId, issue.id, issue.photoUrl, issue.photoHash, issue.photoStatus, issue.photos, issue.photoData, refs.length]);

  const previews = refs.map((photo) => ({
    id: photo.id,
    src: photo.url || localSrc[photo.id] || '',
  })).filter((row) => row.src);
  if (!previews.length && (issue.photoUrl || localSrc.legacy || issue.photoData)) {
    previews.push({ id: 'photo', src: issue.photoUrl || localSrc.legacy || issue.photoData || '' });
  }
  const status = photoStatusCopy(issue);
  const canEditPhotos = Boolean(farmId && uid && canResolve);

  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-[1200] sm:inset-auto sm:left-1/2 sm:bottom-10 sm:-translate-x-1/2 sm:w-full sm:max-w-md p-3 sm:p-0">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {issue.note || `${issue.category.charAt(0).toUpperCase()}${issue.category.slice(1)} issue`}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 capitalize">
              {issue.priority} priority · {issue.status}
              {!issue.note ? ` · ${issue.category}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 pb-4 space-y-3">
          {canEditPhotos ? (
            <IssuePhotoField
              photos={previews}
              onAdd={async (blob) => {
                if (!farmId || !uid) return;
                const { attachIssuePhoto } = await import('../../lib/attachIssuePhoto');
                await attachIssuePhoto(farmId, issue.id, blob, {
                  createdBy: uid,
                  blockId: issue.blockId,
                });
              }}
              onRemove={async (photoId) => {
                if (!farmId) return;
                const { removeIssuePhoto } = await import('../../lib/attachIssuePhoto');
                await removeIssuePhoto(farmId, issue.id, photoId);
              }}
            />
          ) : previews.length ? (
            <div className="grid grid-cols-2 gap-1.5">
              {previews.map((photo) => (
                <img key={photo.id} src={photo.src} alt="" className="w-full max-h-48 object-cover rounded-xl" />
              ))}
            </div>
          ) : null}
          {status ? (
            <p className={issue.photoStatus === 'failed' ? 'text-xs text-red-600' : 'text-xs text-slate-500'}>
              {status}
            </p>
          ) : null}
          <p className="text-[10px] text-slate-400 capitalize">
            {issue.category} · reported {new Date(issue.reportedAt).toLocaleString()}
          </p>
          {canResolve && issue.status !== 'resolved' && (
            <button
              type="button"
              onClick={onResolve}
              className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
            >
              Mark resolved
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
