/**
 * Gzip + Hot-style AEAD for a day's farm chat. Never FarmSeed. Never BonesKey.
 * Freenet uses the farm HotKey. Hosted has no HotKey — SHA-256(farmId) wrap;
 * Firestore admin-only rules are the access control.
 * Plans/FARM_MESSAGING.md
 */
import {
  decryptHotBlobWithKey,
  encryptHotBlobWithKey,
  sha256Hex,
} from '../../../units/mist-freenet/src/index.ts';
import { FARM_CHAT_DAY_CAP, parseFarmChatMessages, type FarmChatMessage } from './farmChatLog';

export const FARM_CHAT_ARCHIVE_SEAL_LABEL = 'pufam-farm-chat-archive-v1';

export type FarmChatArchivePlain = {
  v: 1;
  date: string;
  messages: FarmChatMessage[];
};

function asBlobPart(bytes: Uint8Array): BlobPart {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function looksGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

async function gzipEncode(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') return bytes;
  const stream = new Blob([asBlobPart(bytes)]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gzipDecode(bytes: Uint8Array): Promise<Uint8Array> {
  if (!looksGzip(bytes)) return bytes;
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This device cannot decompress a chat archive.');
  }
  const stream = new Blob([asBlobPart(bytes)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Hosted wrap key — farm-visible, not HotKey (hosted farms have none). */
export async function farmChatHostedSealKey(farmId: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${FARM_CHAT_ARCHIVE_SEAL_LABEL}:${farmId}`)
  );
  return new Uint8Array(digest);
}

export async function sealFarmChatDay(
  date: string,
  messages: readonly FarmChatMessage[],
  keyBytes: Uint8Array
): Promise<string> {
  const plain: FarmChatArchivePlain = {
    v: 1,
    date,
    messages: parseFarmChatMessages(messages, FARM_CHAT_DAY_CAP),
  };
  const raw = new TextEncoder().encode(JSON.stringify(plain));
  const gz = await gzipEncode(raw);
  const sealed = await encryptHotBlobWithKey(gz.length < raw.length ? gz : raw, keyBytes);
  return new TextDecoder().decode(sealed);
}

export async function openFarmChatDay(
  blob: string,
  keyBytes: Uint8Array
): Promise<FarmChatArchivePlain> {
  const opened = await decryptHotBlobWithKey(new TextEncoder().encode(blob), keyBytes);
  const text = new TextDecoder().decode(await gzipDecode(opened));
  const parsed = JSON.parse(text) as { date?: unknown; messages?: unknown };
  if (typeof parsed.date !== 'string') throw new Error('Chat archive is missing a date.');
  return {
    v: 1,
    date: parsed.date,
    messages: parseFarmChatMessages(parsed.messages, FARM_CHAT_DAY_CAP),
  };
}

export function farmChatArchiveContentHash(blob: string): string {
  return sha256Hex(new TextEncoder().encode(blob));
}

export function formatFarmChatLogTxt(date: string, messages: readonly FarmChatMessage[]): string {
  const lines = messages.map((row) => `${row.at}\t${row.authorName}\t${row.text}`);
  return [`# PUF-AM farm chat ${date}`, `# timezone Australia/Perth`, '', ...lines, ''].join('\n');
}

export function farmChatLogsVisible(role: string | null | undefined): boolean {
  return role === 'admin';
}
