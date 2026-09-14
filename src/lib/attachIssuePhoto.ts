/**
 * Attach or remove a compressed issue photo on the farm's real pipe.
 * Hosted: enqueue compressed JPEG only. Freenet: HotKey-sealed blob + index.
 *
 * @see Plans/FREENET_NETWORK_PACK.md Decision 2026-09-14
 */

import {
  assertCanAddPhoto,
  farmPhotoCacheId,
  listIssuePhotoRefs,
  nextFarmPhotoId,
  removePhotoRef,
  syncLegacyIssuePhotoFields,
  upsertPhotoRef,
  type FarmPhotoRef,
} from './farmPhoto';
import { isFreenetFarm, usesCloudSyncOutbox } from './farmPipes';
import { useFieldStore } from './fieldStore';
import { flushPhotoOutbox } from './flushPhotoOutbox';
import { deleteFarmPhotoCache, putIssuePhotoCache } from './issuePhotoCache';
import { compressFarmPhoto, type CompressedFarmPhoto } from './photoCompress';
import { enqueuePhoto } from './photoOutbox';

export type AttachIssuePhotoInput = {
  createdBy: string;
  blockId?: string;
};

export type AttachIssuePhotoResult = {
  compressed: CompressedFarmPhoto;
  photoId: string;
  pipe: 'cloud' | 'freenet' | 'local';
};

async function patchPhoto(
  farmId: string,
  issueId: string,
  updates: Parameters<ReturnType<typeof useFieldStore.getState>['updateIssue']>[2],
  opts: { queueCloud: boolean },
): Promise<void> {
  await useFieldStore.getState().updateIssue(farmId, issueId, updates, {
    queueCloud: opts.queueCloud,
    publishHot: false,
  });
}

function currentIssue(farmId: string, issueId: string) {
  const state = useFieldStore.getState();
  return (
    state.issues.find((row) => row.id === issueId) ||
    state.archivedIssues.find((row) => row.id === issueId) ||
    null
  );
}

function cacheRow(
  farmId: string,
  issueId: string,
  photoId: string,
  compressed: CompressedFarmPhoto,
  extra: Pick<import('./issuePhotoCache').IssuePhotoCacheRow, 'status'> &
    Partial<import('./issuePhotoCache').IssuePhotoCacheRow>,
): import('./issuePhotoCache').IssuePhotoCacheRow {
  return {
    id: farmPhotoCacheId('issue', farmId, issueId, photoId),
    farmId,
    kind: 'issue' as const,
    issueId,
    recordId: issueId,
    photoId,
    blob: compressed.blob,
    bytes: compressed.bytes,
    width: compressed.width,
    height: compressed.height,
    contentType: compressed.contentType,
    updatedAt: new Date().toISOString(),
    ...extra,
  };
}

export async function attachIssuePhoto(
  farmId: string,
  issueId: string,
  source: Blob,
  meta: AttachIssuePhotoInput,
): Promise<AttachIssuePhotoResult> {
  const issue = currentIssue(farmId, issueId);
  const existing = issue ? listIssuePhotoRefs(issue) : [];
  assertCanAddPhoto(existing.length);
  const photoId = nextFarmPhotoId(existing);
  const compressed = await compressFarmPhoto(source);
  const now = new Date().toISOString();
  const ref: FarmPhotoRef = {
    id: photoId,
    createdAt: now,
    createdBy: meta.createdBy,
    ...(meta.blockId ? { blockId: meta.blockId } : {}),
    bytes: compressed.bytes,
    width: compressed.width,
    height: compressed.height,
    contentType: compressed.contentType,
    status: 'uploading',
  };
  const photos = upsertPhotoRef(existing, ref);
  const legacy = syncLegacyIssuePhotoFields(photos);

  await putIssuePhotoCache(cacheRow(farmId, issueId, photoId, compressed, { status: 'uploading' }));
  await patchPhoto(farmId, issueId, { ...legacy, photoError: '' }, { queueCloud: false });

  if (usesCloudSyncOutbox()) {
    await enqueuePhoto(farmId, issueId, compressed.blob, photoId);
    try {
      await flushPhotoOutbox(farmId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await putIssuePhotoCache(
        cacheRow(farmId, issueId, photoId, compressed, { status: 'failed', error: message }),
      );
      const failed = upsertPhotoRef(photos, { ...ref, status: 'failed', error: message });
      await patchPhoto(
        farmId,
        issueId,
        { ...syncLegacyIssuePhotoFields(failed), photoError: message },
        { queueCloud: false },
      );
      throw error;
    }
    return { compressed, photoId, pipe: 'cloud' };
  }

  if (isFreenetFarm()) {
    try {
      const jpeg = new Uint8Array(await compressed.blob.arrayBuffer());
      const { publishIssuePhotoToFreenet } = await import('../mist/mistPhotoFreenet');
      const published = await publishIssuePhotoToFreenet({
        farmId,
        issueId,
        photoId,
        jpeg,
        width: compressed.width,
        height: compressed.height,
        bytes: compressed.bytes,
        contentType: compressed.contentType,
      });
      const status = published.pending ? 'uploading' : 'ready';
      await putIssuePhotoCache(
        cacheRow(farmId, issueId, photoId, compressed, {
          status,
          freenetUri: published.uri,
          contentHash: published.contentHash,
        }),
      );
      const next = upsertPhotoRef(photos, {
        ...ref,
        status,
        hash: published.contentHash,
        freenetUri: published.uri,
        error: '',
      });
      await patchPhoto(farmId, issueId, { ...syncLegacyIssuePhotoFields(next), photoError: '' }, { queueCloud: false });
      return { compressed, photoId, pipe: 'freenet' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await putIssuePhotoCache(
        cacheRow(farmId, issueId, photoId, compressed, { status: 'failed', error: message }),
      );
      const failed = upsertPhotoRef(photos, { ...ref, status: 'failed', error: message });
      await patchPhoto(
        farmId,
        issueId,
        { ...syncLegacyIssuePhotoFields(failed), photoError: message },
        { queueCloud: false },
      );
      throw error;
    }
  }

  await putIssuePhotoCache(cacheRow(farmId, issueId, photoId, compressed, { status: 'local' }));
  const local = upsertPhotoRef(photos, { ...ref, status: 'local' });
  await patchPhoto(farmId, issueId, syncLegacyIssuePhotoFields(local), { queueCloud: false });
  return { compressed, photoId, pipe: 'local' };
}

export async function removeIssuePhoto(farmId: string, issueId: string, photoId: string): Promise<void> {
  const issue = currentIssue(farmId, issueId);
  const existing = issue ? listIssuePhotoRefs(issue) : [];
  const photos = removePhotoRef(existing, photoId);
  await deleteFarmPhotoCache(farmPhotoCacheId('issue', farmId, issueId, photoId));
  await patchPhoto(farmId, issueId, syncLegacyIssuePhotoFields(photos), {
    queueCloud: usesCloudSyncOutbox(),
  });
  if (isFreenetFarm()) {
    const { removePhotoFromFreenetIndex } = await import('../mist/mistPhotoFreenet');
    await removePhotoFromFreenetIndex({ farmId, kind: 'issue', recordId: issueId, photoId });
  }
}
