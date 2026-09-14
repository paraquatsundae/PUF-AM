import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import type { DiaryEvent } from '../../lib/farmDiary';
import { listEventPhotoRefs } from '../../lib/farmPhoto';
import { getEventPhotoCache } from '../../lib/issuePhotoCache';
import { IssuePhotoField } from '../map/IssuePhotoField';

export function DiaryEventPhotos({
  event,
  farmId,
  canEdit,
}: {
  event: DiaryEvent;
  farmId?: string;
  canEdit: boolean;
}) {
  const { userData } = useAuth();
  const uid = userData?.uid;
  const refs = listEventPhotoRefs(event);
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
        const row = await getEventPhotoCache(farmId, event.id, photo.id);
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
      setLocalSrc(next);
    });
    return () => {
      cancelled = true;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [farmId, event.id, event.photos, refs.length]);

  const previews = refs
    .map((photo) => ({ id: photo.id, src: photo.url || localSrc[photo.id] || '' }))
    .filter((row) => row.src);

  if (!canEdit && previews.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      {canEdit && farmId && uid ? (
        <IssuePhotoField
          photos={previews}
          onAdd={async (blob) => {
            const { attachEventPhoto } = await import('../../lib/attachEventPhoto');
            await attachEventPhoto(farmId, event.id, blob, { createdBy: uid });
          }}
          onRemove={async (photoId) => {
            const { removeEventPhoto } = await import('../../lib/attachEventPhoto');
            await removeEventPhoto(farmId, event.id, photoId);
          }}
        />
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {previews.map((photo) => (
            <img key={photo.id} src={photo.src} alt="" className="w-full h-20 object-cover rounded-lg" />
          ))}
        </div>
      )}
    </div>
  );
}
