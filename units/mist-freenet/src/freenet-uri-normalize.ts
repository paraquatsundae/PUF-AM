/**
 * Normalize pasted Freenet URIs for mist pull-by-URI (workshop two-laptop path).
 */

import { encodeFreenet02Uri, isFreenet02Uri } from './freenet02-uri.ts';

const BASE58_ID = /^[1-9A-HJ-NP-Za-km-z]{20,}$/;
const CHK_PREFIX = 'CHK@';

export class InvalidFreenetUriError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFreenetUriError';
  }
}

/** Normalize pasted FN02 URI, bare base58 contract id, or legacy CHK@ URI. */
export function normalizeMistFreenetUri(raw: string): string {
  const uri = raw.trim();
  if (!uri) {
    throw new InvalidFreenetUriError('Freenet URI is empty');
  }
  if (isFreenet02Uri(uri)) return uri;
  if (uri.startsWith(CHK_PREFIX)) return uri;
  if (BASE58_ID.test(uri)) return encodeFreenet02Uri(uri);
  throw new InvalidFreenetUriError(
    'Invalid Freenet URI — expected FN02@…, CHK@…, or bare base58 contract id',
  );
}
