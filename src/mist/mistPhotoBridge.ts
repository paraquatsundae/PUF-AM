/**
 * Seal issue photos and the photo index under HotKey. Crew can open them;
 * FarmSeed is never required and must not appear in the plaintext.
 *
 * @see Plans/FREENET_NETWORK_PACK.md Decision 2026-09-14
 */

import {
  decryptHotBlobWithKey,
  encryptHotBlobWithKey,
  sha256Hex,
} from '../../units/mist-freenet/src/index.ts';
import { getMistStoreForHotBridge, resolveMistReadKeys } from './mistHotBridge.ts';
import {
  parsePhotoIndex,
  photoIndexStorageKey,
  type IssuePhotoIndex,
} from './photoPayload.ts';

export const PHOTO_INDEX_META_PREFIX = 'pufam.mist.photoIndex.v1';

export type MistPhotoIndexStatus = {
  farmId: string;
  freenetUri?: string;
  contentHash?: string;
  publishedAt?: string;
  pending?: boolean;
  lastError?: string;
  lastIssueId?: string;
};

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function metaKey(farmId: string): string {
  return `${PHOTO_INDEX_META_PREFIX}.${farmId}`;
}

export function getMistPhotoIndexStatus(farmId: string): MistPhotoIndexStatus | null {
  const raw = storage()?.getItem(metaKey(farmId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MistPhotoIndexStatus;
  } catch {
    return null;
  }
}

export function saveMistPhotoIndexStatus(status: MistPhotoIndexStatus): void {
  storage()?.setItem(metaKey(status.farmId), JSON.stringify(status));
}

export async function sealBytesWithHotKey(plain: Uint8Array, hotKeyBytes: Uint8Array): Promise<Uint8Array> {
  return encryptHotBlobWithKey(plain, hotKeyBytes);
}

export async function openBytesWithHotKey(
  ciphertext: Uint8Array,
  hotKeyBytes: Uint8Array,
): Promise<Uint8Array> {
  return decryptHotBlobWithKey(ciphertext, hotKeyBytes);
}

export async function readLocalPhotoIndex(farmId: string): Promise<IssuePhotoIndex | null> {
  const store = await getMistStoreForHotBridge();
  if (!store) return null;
  const keys = await resolveMistReadKeys();
  if (!keys) return null;
  const entry = await store.get(photoIndexStorageKey(farmId));
  if (!entry) return null;
  const plain = await openBytesWithHotKey(entry.ciphertext, keys.hotKey);
  return parsePhotoIndex(JSON.parse(new TextDecoder().decode(plain)));
}

export async function writeLocalPhotoIndex(
  farmId: string,
  index: IssuePhotoIndex,
  hotKeyBytes: Uint8Array,
): Promise<{ storageKey: string; ciphertext: Uint8Array; contentHash: string }> {
  const store = await getMistStoreForHotBridge();
  if (!store) throw new Error('Unlock this farm before sending a photo over Freenet.');
  const plain = new TextEncoder().encode(JSON.stringify(index));
  const ciphertext = await sealBytesWithHotKey(plain, hotKeyBytes);
  const storageKey = photoIndexStorageKey(farmId);
  const contentHash = sha256Hex(ciphertext);
  await store.put(storageKey, ciphertext, {
    kind: 'hot',
    content_hash: contentHash,
    size: ciphertext.byteLength,
  });
  return { storageKey, ciphertext, contentHash };
}

export async function writeLocalPhotoCiphertext(
  storageKey: string,
  ciphertext: Uint8Array,
): Promise<void> {
  const store = await getMistStoreForHotBridge();
  if (!store) throw new Error('Unlock this farm before sending a photo over Freenet.');
  await store.put(storageKey, ciphertext, {
    kind: 'hot',
    content_hash: sha256Hex(ciphertext),
    size: ciphertext.byteLength,
  });
}
