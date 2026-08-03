/**
 * Mist key ↔ Freenet URI mapping (v1).
 *
 * Strategy:
 * - Ciphertext blobs are inserted as **CHK** (FCP) or **FN02@…** (Freenet 0.2 pack-contract).
 * - Local index maps mist key → URI + content_hash (see FreenetMistStore index).
 * - Mutable contracts (hot/current, manifest) are re-put as new blobs; the mist
 *   key always points at the latest URI in the local index. USK/SSK updates are deferred.
 * - **Two-laptop (Option A):** FN02 URI must be copied from laptop A and pasted on B
 *   (`pullByUri`) — B's freenet-index is empty after FarmCode recovery. See
 *   Plans/MIST_TWO_FEDORA_FREENET.md.
 *
 * Browsers cannot run a full Freenet node; only Node/Electron main may use FCP.
 */

export type FreenetKeyRecord = {
  uri: string;
  content_hash: string;
  /** Unix ms when last successfully inserted on Freenet. */
  insertedAt?: number;
  /** True when cached locally but FCP insert not yet confirmed. */
  pending?: boolean;
};

export type FreenetKeyIndex = Record<string, FreenetKeyRecord>;

export function freenetIndexPath(rootDir: string): string {
  return `${rootDir}/_mist/freenet-index.json`;
}

export function outboxPath(rootDir: string): string {
  return `${rootDir}/_mist/freenet-outbox.json`;
}

/** Outbox entry — ciphertext already on disk; only network insert pending. */
export type FreenetOutboxEntry = {
  key: string;
  content_hash: string;
  queuedAt: number;
};
