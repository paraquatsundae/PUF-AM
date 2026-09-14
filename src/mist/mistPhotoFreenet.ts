/**
 * PUT/GET compressed farm photos on Freenet + one photo index (issues + events).
 * Does not republish Hot. Watch ping carries photoIndexHash.
 *
 * @see Plans/FREENET_NETWORK_PACK.md Decision 2026-09-14
 */

import { sha256Hex } from '../../units/mist-freenet/src/index.ts';
import { LEGACY_PHOTO_ID, listEventPhotoRefs, upsertPhotoRef } from '../lib/farmPhoto.ts';
import { eventPhotoCacheId, issuePhotoCacheId, putIssuePhotoCache } from '../lib/issuePhotoCache.ts';
import { PHOTO_CONTENT_TYPE } from '../lib/photoCompress.ts';
import { getFreenetPackTransport } from './freenetTransportSelect.ts';
import {
  getMistStoreForHotBridge,
  resolveMistReadKeys,
} from './mistHotBridge.ts';
import {
  getMistPhotoIndexStatus,
  openBytesWithHotKey,
  readLocalPhotoIndex,
  saveMistPhotoIndexStatus,
  sealBytesWithHotKey,
  writeLocalPhotoCiphertext,
  writeLocalPhotoIndex,
} from './mistPhotoBridge.ts';
import {
  assertNoFarmSeedInPhotoValue,
  EVENT_PHOTO_KIND,
  eventPhotoStorageKey,
  ISSUE_PHOTO_KIND,
  issuePhotoStorageKey,
  packIssuePhotoBlob,
  parseIssuePhotoBlob,
  removePhotoIndexEntry,
  upsertPhotoIndexEntry,
  type IssuePhotoIndexEntry,
} from './photoPayload.ts';
import { localFreenetSearchBudgetMs, readLocalFreenetBlob, shouldUseLocalFreenetForReads } from './freenetLocalNode.ts';
import { apiHubMissing } from '../lib/apiBase.ts';
import { normalizeMistFreenetUri } from '../../units/mist-freenet/src/freenet-uri-normalize.ts';
import type { FarmPhotoKind } from '../lib/farmPhoto.ts';

export type PublishIssuePhotoInput = {
  farmId: string;
  issueId: string;
  photoId?: string;
  jpeg: Uint8Array;
  width: number;
  height: number;
  bytes: number;
  contentType?: string;
};

export type PublishEventPhotoInput = {
  farmId: string;
  eventId: string;
  photoId: string;
  jpeg: Uint8Array;
  width: number;
  height: number;
  bytes: number;
  contentType?: string;
};

export type PublishIssuePhotoResult = {
  uri?: string;
  contentHash: string;
  indexUri?: string;
  indexHash: string;
  pending?: boolean;
};

async function publishCiphertext(input: {
  farmId: string;
  storageKey: string;
  ciphertext: Uint8Array;
  contentHash: string;
}) {
  return getFreenetPackTransport().publishBlob({
    farmId: input.farmId,
    kind: 'hot',
    storageKey: input.storageKey,
    ciphertext: input.ciphertext,
    contentHash: input.contentHash,
  });
}

async function publishSealedPhoto(input: {
  farmId: string;
  storageKey: string;
  lastRecordId: string;
  meta: Parameters<typeof packIssuePhotoBlob>[0];
  jpeg: Uint8Array;
  entry: IssuePhotoIndexEntry;
}): Promise<PublishIssuePhotoResult> {
  const keys = await resolveMistReadKeys();
  if (!keys) throw new Error('Unlock this farm (Hot key) before sending a photo over Freenet.');

  assertNoFarmSeedInPhotoValue(input.meta);
  const plain = packIssuePhotoBlob(input.meta, input.jpeg);
  const ciphertext = await sealBytesWithHotKey(plain, keys.hotKey);
  const contentHash = sha256Hex(ciphertext);
  await writeLocalPhotoCiphertext(input.storageKey, ciphertext);

  saveMistPhotoIndexStatus({
    ...getMistPhotoIndexStatus(input.farmId),
    farmId: input.farmId,
    pending: true,
    lastIssueId: input.lastRecordId,
  });

  const published = await publishCiphertext({
    farmId: input.farmId,
    storageKey: input.storageKey,
    ciphertext,
    contentHash,
  });

  const entry = { ...input.entry, uri: published.freenetUri || input.entry.uri, contentHash };
  const index = upsertPhotoIndexEntry(await readLocalPhotoIndex(input.farmId), input.farmId, entry);
  const sealedIndex = await writeLocalPhotoIndex(input.farmId, index, keys.hotKey);
  const indexPut = await publishCiphertext({
    farmId: input.farmId,
    storageKey: sealedIndex.storageKey,
    ciphertext: sealedIndex.ciphertext,
    contentHash: sealedIndex.contentHash,
  });

  saveMistPhotoIndexStatus({
    farmId: input.farmId,
    freenetUri: indexPut.freenetUri,
    contentHash: sealedIndex.contentHash,
    publishedAt: entry.updatedAt,
    pending: Boolean(indexPut.freenetPending || published.freenetPending),
    lastIssueId: input.lastRecordId,
  });

  const { publishHotWatchAfterPhotoPut } = await import('./hotWatchSync.ts');
  await publishHotWatchAfterPhotoPut(input.farmId);

  return {
    uri: published.freenetUri,
    contentHash,
    indexUri: indexPut.freenetUri,
    indexHash: sealedIndex.contentHash,
    pending: Boolean(indexPut.freenetPending || published.freenetPending),
  };
}

export async function publishIssuePhotoToFreenet(
  input: PublishIssuePhotoInput,
): Promise<PublishIssuePhotoResult> {
  const photoId = input.photoId || LEGACY_PHOTO_ID;
  const updatedAt = new Date().toISOString();
  return publishSealedPhoto({
    farmId: input.farmId,
    storageKey: issuePhotoStorageKey(input.farmId, input.issueId, photoId),
    lastRecordId: input.issueId,
    meta: {
      v: 1,
      kind: ISSUE_PHOTO_KIND,
      farmId: input.farmId,
      issueId: input.issueId,
      photoId,
      contentType: input.contentType || PHOTO_CONTENT_TYPE,
      width: input.width,
      height: input.height,
      bytes: input.bytes,
    },
    jpeg: input.jpeg,
    entry: {
      kind: 'issue',
      recordId: input.issueId,
      photoId,
      issueId: input.issueId,
      uri: '',
      contentHash: '',
      bytes: input.bytes,
      width: input.width,
      height: input.height,
      contentType: input.contentType || PHOTO_CONTENT_TYPE,
      updatedAt,
    },
  });
}

export async function publishEventPhotoToFreenet(
  input: PublishEventPhotoInput,
): Promise<PublishIssuePhotoResult> {
  const updatedAt = new Date().toISOString();
  return publishSealedPhoto({
    farmId: input.farmId,
    storageKey: eventPhotoStorageKey(input.farmId, input.eventId, input.photoId),
    lastRecordId: input.eventId,
    meta: {
      v: 1,
      kind: EVENT_PHOTO_KIND,
      farmId: input.farmId,
      eventId: input.eventId,
      photoId: input.photoId,
      contentType: input.contentType || PHOTO_CONTENT_TYPE,
      width: input.width,
      height: input.height,
      bytes: input.bytes,
    },
    jpeg: input.jpeg,
    entry: {
      kind: 'event',
      recordId: input.eventId,
      photoId: input.photoId,
      eventId: input.eventId,
      uri: '',
      contentHash: '',
      bytes: input.bytes,
      width: input.width,
      height: input.height,
      contentType: input.contentType || PHOTO_CONTENT_TYPE,
      updatedAt,
    },
  });
}

export async function removePhotoFromFreenetIndex(input: {
  farmId: string;
  kind: FarmPhotoKind;
  recordId: string;
  photoId: string;
}): Promise<void> {
  const keys = await resolveMistReadKeys();
  if (!keys) return;
  const index = removePhotoIndexEntry(await readLocalPhotoIndex(input.farmId), input.farmId, input);
  const sealedIndex = await writeLocalPhotoIndex(input.farmId, index, keys.hotKey);
  const indexPut = await publishCiphertext({
    farmId: input.farmId,
    storageKey: sealedIndex.storageKey,
    ciphertext: sealedIndex.ciphertext,
    contentHash: sealedIndex.contentHash,
  });
  saveMistPhotoIndexStatus({
    farmId: input.farmId,
    freenetUri: indexPut.freenetUri,
    contentHash: sealedIndex.contentHash,
    publishedAt: index.updatedAt,
    pending: Boolean(indexPut.freenetPending),
  });
  const { publishHotWatchAfterPhotoPut } = await import('./hotWatchSync.ts');
  await publishHotWatchAfterPhotoPut(input.farmId);
}

async function pullCiphertextByUri(
  farmId: string,
  storageKey: string,
  freenetUri: string,
  contentHash?: string,
): Promise<Uint8Array> {
  if (await shouldUseLocalFreenetForReads()) {
    try {
      const local = await readLocalFreenetBlob(normalizeMistFreenetUri(freenetUri), {
        deadlineMs: localFreenetSearchBudgetMs(!apiHubMissing()),
      });
      if (local?.length) {
        const actual = sha256Hex(local);
        if (contentHash && actual !== contentHash) {
          throw new Error('Freenet returned the wrong bytes for a photo');
        }
        await writeLocalPhotoCiphertext(storageKey, local);
        return local;
      }
    } catch {
      /* fall through to transport */
    }
  }

  const remote = await getFreenetPackTransport().pullByUri({
    farmId,
    kind: 'hot',
    storageKey,
    freenetUri,
    ...(contentHash ? { contentHash } : {}),
  });
  await writeLocalPhotoCiphertext(storageKey, remote.ciphertext);
  return remote.ciphertext;
}

export async function applyPhotoIndexWatch(
  farmId: string,
  photoIndexUri: string,
  photoIndexHash: string,
): Promise<number> {
  const keys = await resolveMistReadKeys();
  if (!keys) throw new Error('Unlock this farm (Hot key) to fetch a photo.');

  const store = await getMistStoreForHotBridge();
  if (!store) throw new Error('Unlock this farm before fetching a photo over Freenet.');

  const indexKey = (await import('./photoPayload.ts')).photoIndexStorageKey(farmId);
  const indexCt = await pullCiphertextByUri(farmId, indexKey, photoIndexUri, photoIndexHash);
  const index = (await import('./photoPayload.ts')).parsePhotoIndex(
    JSON.parse(new TextDecoder().decode(await openBytesWithHotKey(indexCt, keys.hotKey))),
  );

  let fetched = 0;
  const { useFieldStore } = await import('../lib/fieldStore');
  const { useFarmDiaryStore } = await import('../lib/farmDiaryStore');
  const { listIssuePhotoRefs, syncLegacyIssuePhotoFields } = await import('../lib/farmPhoto');
  for (const entry of index.photos) {
    if (!entry.uri) continue;
    const storageKey =
      entry.kind === 'event'
        ? eventPhotoStorageKey(farmId, entry.recordId, entry.photoId)
        : issuePhotoStorageKey(farmId, entry.recordId, entry.photoId);
    const existing = await store.get(storageKey);
    if (existing?.meta.content_hash === entry.contentHash) continue;

    const ct = await pullCiphertextByUri(farmId, storageKey, entry.uri, entry.contentHash);
    const plain = await openBytesWithHotKey(ct, keys.hotKey);
    const { meta, jpeg } = parseIssuePhotoBlob(plain);
    const photoId = meta.photoId || entry.photoId || LEGACY_PHOTO_ID;
    await putIssuePhotoCache({
      id:
        entry.kind === 'event'
          ? eventPhotoCacheId(farmId, entry.recordId, photoId)
          : issuePhotoCacheId(farmId, entry.recordId, photoId),
      farmId,
      kind: entry.kind,
      issueId: entry.kind === 'issue' ? entry.recordId : undefined,
      eventId: entry.kind === 'event' ? entry.recordId : undefined,
      recordId: entry.recordId,
      photoId,
      blob: new Blob([jpeg], { type: meta.contentType }),
      bytes: meta.bytes || jpeg.byteLength,
      width: meta.width,
      height: meta.height,
      contentType: meta.contentType,
      status: 'ready',
      freenetUri: entry.uri,
      contentHash: entry.contentHash,
      updatedAt: entry.updatedAt,
    });
    if (entry.kind === 'event') {
      const event = useFarmDiaryStore.getState().events.find((row) => row.id === entry.recordId);
      const photos = upsertPhotoRef(event ? listEventPhotoRefs(event) : [], {
        id: photoId,
        createdAt: entry.updatedAt,
        createdBy: event?.createdBy || '',
        hash: entry.contentHash,
        freenetUri: entry.uri,
        bytes: entry.bytes,
        width: entry.width,
        height: entry.height,
        contentType: entry.contentType,
        status: 'ready',
      });
      await useFarmDiaryStore.getState().updateEvent(
        farmId,
        true,
        entry.recordId,
        { photos },
        { queueCloud: false, publishHot: false },
      );
    } else {
      const issue =
        useFieldStore.getState().issues.find((row) => row.id === entry.recordId) ||
        useFieldStore.getState().archivedIssues.find((row) => row.id === entry.recordId);
      const photos = upsertPhotoRef(issue ? listIssuePhotoRefs(issue) : [], {
        id: photoId,
        createdAt: entry.updatedAt,
        createdBy: issue?.reportedBy || '',
        hash: entry.contentHash,
        freenetUri: entry.uri,
        bytes: entry.bytes,
        width: entry.width,
        height: entry.height,
        contentType: entry.contentType,
        status: 'ready',
      });
      await useFieldStore.getState().updateIssue(
        farmId,
        entry.recordId,
        { ...syncLegacyIssuePhotoFields(photos), photoError: '' },
        { queueCloud: false, publishHot: false },
      );
    }
    fetched += 1;
  }

  saveMistPhotoIndexStatus({
    farmId,
    freenetUri: photoIndexUri,
    contentHash: photoIndexHash,
    publishedAt: index.updatedAt,
    pending: false,
  });
  return fetched;
}
