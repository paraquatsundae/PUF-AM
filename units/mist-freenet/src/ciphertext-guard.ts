/**
 * Encrypt-before-upload guard for Freenet inserts (workshop frozen ~2026-08-03).
 *
 * Freenet CHK is transport only — farm bytes must be AEAD-sealed before put().
 */

import type { HotCiphertextEnvelope } from './hot-crypto.ts';
import { parseMistKey } from './keys.ts';
import type { MistKind } from './types.ts';

export type MistAeadEnvelope = HotCiphertextEnvelope;

/** True when bytes are a mist-v1 AES-GCM envelope JSON blob. */
export function isMistAeadEnvelope(bytes: Uint8Array): boolean {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!parsed || typeof parsed !== 'object') return false;
    const o = parsed as Record<string, unknown>;
    return o.v === 1 && o.alg === 'aes-256-gcm' && typeof o.iv === 'string' && typeof o.ct === 'string';
  } catch {
    return false;
  }
}

function isPlainHotStateJson(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return typeof o.farm_id === 'string' && Array.isArray(o.records);
}

function isObviousPlaintextFarmJson(bytes: Uint8Array): boolean {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (isPlainHotStateJson(parsed)) return true;
    if (!parsed || typeof parsed !== 'object') return false;
    const o = parsed as Record<string, unknown>;
    if (typeof o.farm_id === 'string' && typeof o.version === 'number' && 'hot_contract_key' in o) {
      return true;
    }
    if (typeof o.farmId === 'string' && o.kind === 'bones-workshop') return true;
    return false;
  } catch {
    return false;
  }
}

export type AssertCiphertextOptions = {
  /** Workshop tests only — skip envelope check. */
  allowPlaintext?: boolean;
};

/**
 * Reject plaintext farm payloads before Freenet insert.
 * Hot must use the AEAD envelope from hot-crypto; other kinds require the same envelope shape.
 */
export function assertCiphertextForFreenet(
  key: string,
  bytes: Uint8Array,
  options?: AssertCiphertextOptions,
): void {
  if (options?.allowPlaintext) return;

  const parsed = parseMistKey(key);
  const kind: MistKind = parsed?.kind ?? 'bones';

  if (isObviousPlaintextFarmJson(bytes)) {
    throw new Error(
      `FreenetMistStore.put: plaintext ${kind} JSON rejected for ${key} — AEAD-seal before upload`,
    );
  }

  if (kind === 'hot' && !isMistAeadEnvelope(bytes)) {
    throw new Error(
      `FreenetMistStore.put: hot blob at ${key} must be AEAD envelope (encryptHotBlob) before Freenet upload`,
    );
  }

  if (kind !== 'hot' && !isMistAeadEnvelope(bytes)) {
    throw new Error(
      `FreenetMistStore.put: ${kind} blob at ${key} must be AEAD-sealed before Freenet upload`,
    );
  }
}
