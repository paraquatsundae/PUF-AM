/**
 * Freenet chat archives — HotKey AEAD at hot/chat-archive/{date}.
 * Must fit one 64 KiB pack. Watch notices via farmChatHash on hot/current
 * (archive index in the farm_chat payload). Never a new hash with an old URI.
 * Plans/FARM_MESSAGING.md
 */
import { FREENET02_MAX_BLOB_BYTES } from '../../../units/mist-freenet/src/freenet02-pack-id.ts';
import { hotKey, sha256Hex } from '../../../units/mist-freenet/src/index.ts';
import { getFreenetPackTransport } from '../../../src/mist/freenetTransportSelect';
import {
  getMistStoreForHotBridge,
  resolveMistReadKeys,
} from '../../../src/mist/mistHotBridge';
import { farmChatArchiveContentHash, openFarmChatDay, sealFarmChatDay } from './farmChatArchive';
import type { FarmChatArchiveRef } from './farmChatDay';
import { farmChatHotWatchPairOk } from './farmChatLog';
import type { FarmChatMessage } from './farmChatLog';

export function farmChatArchiveHotSegment(date: string): string {
  return `chat-archive/${date}`;
}

export function farmChatArchiveHotKey(farmId: string, date: string): string {
  return hotKey(farmId, farmChatArchiveHotSegment(date));
}

export async function putFarmChatArchiveHot(
  farmId: string,
  date: string,
  messages: readonly FarmChatMessage[]
): Promise<FarmChatArchiveRef | null> {
  const keys = await resolveMistReadKeys();
  const store = await getMistStoreForHotBridge();
  if (!keys?.hotKey || !store) return null;
  const blob = await sealFarmChatDay(date, messages, keys.hotKey);
  const ciphertext = new TextEncoder().encode(blob);
  if (ciphertext.byteLength > FREENET02_MAX_BLOB_BYTES) {
    throw new Error('That day’s chat is too large for one Freenet pack.');
  }
  const contentHash = sha256Hex(ciphertext);
  const storageKey = farmChatArchiveHotKey(farmId, date);
  await store.put(storageKey, ciphertext, { kind: 'hot', content_hash: contentHash });
  let uri: string | undefined;
  try {
    const published = await getFreenetPackTransport().publishBlob({
      farmId,
      kind: 'hot',
      storageKey,
      ciphertext,
      contentHash,
    });
    uri = published.freenetUri;
    if (uri && !farmChatHotWatchPairOk({ farmChatHash: contentHash, hotUri: uri })) {
      uri = undefined;
    }
  } catch {
    /* local store still has the day; watch index updates on the next Hot PUT */
  }
  return { date, contentHash: farmChatArchiveContentHash(blob), ...(uri ? { uri } : {}) };
}

export async function readFarmChatArchiveHot(
  farmId: string,
  ref: FarmChatArchiveRef
): Promise<FarmChatMessage[]> {
  const keys = await resolveMistReadKeys();
  const store = await getMistStoreForHotBridge();
  if (!keys?.hotKey || !store) return [];
  const storageKey = farmChatArchiveHotKey(farmId, ref.date);
  let bytes = (await store.get(storageKey))?.ciphertext;
  if (!bytes?.length && ref.uri) {
    const remote = await getFreenetPackTransport().pullByUri({
      farmId,
      kind: 'hot',
      storageKey,
      freenetUri: ref.uri,
      ...(ref.contentHash ? { contentHash: ref.contentHash } : {}),
    });
    bytes = remote.ciphertext;
    if (bytes?.length) {
      await store.put(storageKey, bytes, { kind: 'hot', content_hash: remote.contentHash });
    }
  }
  if (!bytes?.length) return [];
  const opened = await openFarmChatDay(new TextDecoder().decode(bytes), keys.hotKey);
  return opened.messages;
}
