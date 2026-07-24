/**
 * Encode / decode .pufom files (gzip JSON, with uncompressed fallback).
 */
import {
  isPufomBundleV1,
  type PufomBundleV1,
} from '../../shared/sync/pufomBundle';

const MAGIC_JSON = 'PUFOM1\n';

function asBlobPart(bytes: Uint8Array): BlobPart {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

async function gzipEncode(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') return bytes;
  const stream = new Blob([asBlobPart(bytes)]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function gzipDecode(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot decompress .pufom gzip files.');
  }
  const stream = new Blob([asBlobPart(bytes)])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

function looksGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

function textDecoder(): TextDecoder {
  return new TextDecoder('utf-8');
}

function textEncoder(): TextEncoder {
  return new TextEncoder();
}

export async function encodePufomBundle(bundle: PufomBundleV1): Promise<Uint8Array> {
  const json = JSON.stringify(bundle);
  const raw = textEncoder().encode(json);
  try {
    const gz = await gzipEncode(raw);
    if (gz.length < raw.length) return gz;
  } catch {
    /* fall through */
  }
  return textEncoder().encode(MAGIC_JSON + json);
}

export async function decodePufomBytes(bytes: Uint8Array): Promise<PufomBundleV1> {
  let text: string;
  if (looksGzip(bytes)) {
    const raw = await gzipDecode(bytes);
    text = textDecoder().decode(raw);
  } else {
    text = textDecoder().decode(bytes);
    if (text.startsWith(MAGIC_JSON)) text = text.slice(MAGIC_JSON.length);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Not a valid .pufom file (bad JSON).');
  }
  if (!isPufomBundleV1(parsed)) {
    throw new Error('Not a valid .pufom v1 bundle.');
  }
  return parsed;
}

export async function decodePufomBlob(blob: Blob): Promise<PufomBundleV1> {
  const buf = await blob.arrayBuffer();
  return decodePufomBytes(new Uint8Array(buf));
}
