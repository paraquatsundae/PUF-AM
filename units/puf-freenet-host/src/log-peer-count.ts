/**
 * Peer count from this bake's Freenet `--log-dir` (0.2.135 has no JSON peer API).
 *
 * Latest `ring_connections=` wins; `connection_count=` is the fallback on the
 * same lines the node already writes. Do not scrape the HTML dashboard.
 * Do not invent peer locations.
 *
 * Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-14 (peer count from logs).
 */

import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  parseFreenetLogContractTraffic,
  type FreenetContractTrafficEvent,
  type ParseFreenetLogContractOptions,
} from './contract-traffic.ts';
import type { FreenetNodeRingInfo } from './types.ts';

export const FREENET_LOG_HOUR_NAME = /^freenet\.\d{4}-\d{2}-\d{2}-\d{2}\.log$/;
export const FREENET_LOG_RING_LAST = 'pufam-ring.last';
export const FREENET_LOG_RING_FALLBACK = 'pufam-ring.log';
export const FREENET_LOG_TAIL_BYTES = 256 * 1024;
/** Ignore leftover lines from a previous node that is not writing here. */
export const FREENET_LOG_PEER_FRESH_MS = 2 * 60 * 60 * 1000;
const MAX_PEER_COUNT = 10_000;

const RING_RE = /\bring_connections=(\d+)\b/;
const CONN_RE = /\bconnection_count=(\d+)\b/;
const TS_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/;

export type FreenetLogPeerKey = 'ring_connections' | 'connection_count';

export type FreenetLogPeerHit = {
  peerCount: number;
  key: FreenetLogPeerKey;
};

export type ParseFreenetLogPeerOptions = {
  nowMs?: number;
  /** `null` disables the freshness window (tests). */
  freshMs?: number | null;
  /** Used when a matching line has no ISO timestamp (the one-line last file). */
  fileMtimeMs?: number;
};

function asPeerCount(raw: string): number | null {
  if (!/^\d{1,5}$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > MAX_PEER_COUNT) return null;
  return n;
}

function lineTimeMs(line: string): number | undefined {
  const match = TS_RE.exec(line.trim());
  if (!match) return undefined;
  const stamp = match[1].endsWith('Z') ? match[1] : `${match[1]}Z`;
  const ms = Date.parse(stamp);
  return Number.isFinite(ms) ? ms : undefined;
}

function isFresh(line: string, options: ParseFreenetLogPeerOptions): boolean {
  const freshMs = options.freshMs === undefined ? FREENET_LOG_PEER_FRESH_MS : options.freshMs;
  if (freshMs === null) return true;
  const nowMs = options.nowMs ?? Date.now();
  const at = lineTimeMs(line) ?? options.fileMtimeMs;
  if (at === undefined) return true;
  return nowMs - at <= freshMs;
}

/** One log line → N, preferring `ring_connections` when both keys are present. */
export function parseFreenetLogPeerLine(line: string): FreenetLogPeerHit | null {
  if (!line || line.trimStart().startsWith('<')) return null;
  const ring = RING_RE.exec(line);
  if (ring) {
    const peerCount = asPeerCount(ring[1]);
    if (peerCount !== null) return { peerCount, key: 'ring_connections' };
  }
  const conn = CONN_RE.exec(line);
  if (conn) {
    const peerCount = asPeerCount(conn[1]);
    if (peerCount !== null) return { peerCount, key: 'connection_count' };
  }
  return null;
}

export function lineHasFreenetLogPeerCount(line: string): boolean {
  return parseFreenetLogPeerLine(line) !== null;
}

/**
 * Latest matching line in `text`. Walks from the end so a later
 * `connection_count` does not lose to an earlier `ring_connections`.
 */
export function parseFreenetLogPeerCount(
  text: string,
  options: ParseFreenetLogPeerOptions = {},
): FreenetLogPeerHit | null {
  if (!text || text.trimStart().startsWith('<')) return null;
  const lines = text.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    const hit = parseFreenetLogPeerLine(line);
    if (!hit) continue;
    if (!isFresh(line, options)) return null;
    return hit;
  }
  return null;
}

export function jsonRingHasReportedPeers(ring?: FreenetNodeRingInfo | null): boolean {
  if (!ring) return false;
  if (ring.peerSource === 'locations' || ring.peerSource === 'ids') return true;
  return ring.peerSource === 'count' && ring.peerCount > 0;
}

/** Fill N from the log when JSON has no peer list (0.2.135 `/status` 404). */
export function mergeFreenetRingFromLog(
  ring: FreenetNodeRingInfo | undefined,
  hit: FreenetLogPeerHit | null,
): FreenetNodeRingInfo | undefined {
  if (!hit) return ring;
  if (jsonRingHasReportedPeers(ring)) return ring;
  return {
    peers: [],
    peerCount: hit.peerCount,
    peerSource: hit.peerCount > 0 ? 'count' : 'none',
    ...(ring?.nodeVersion ? { nodeVersion: ring.nodeVersion } : {}),
    ...(ring?.location !== undefined ? { location: ring.location } : {}),
  };
}

function tailFile(filePath: string, maxBytes: number): string {
  const size = statSync(filePath).size;
  const start = Math.max(0, size - maxBytes);
  const len = size - start;
  if (len <= 0) return '';
  const fd = openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, start);
    return buf.toString('utf8');
  } finally {
    closeSync(fd);
  }
}

/**
 * Read this bake's `--log-dir`. Hour files first (newest name), then the
 * one-line Android fallback. Never reads `freenet.error.*`.
 */
export function readFreenetLogPeerCount(
  logDir: string,
  options: ParseFreenetLogPeerOptions = {},
): FreenetLogPeerHit | null {
  if (!logDir || !existsSync(logDir)) return null;
  let names: string[];
  try {
    names = readdirSync(logDir);
  } catch {
    return null;
  }
  const hourLogs = names.filter((name) => FREENET_LOG_HOUR_NAME.test(name)).sort().reverse();
  const extras = [FREENET_LOG_RING_LAST, FREENET_LOG_RING_FALLBACK].filter((name) =>
    names.includes(name),
  );
  for (const name of [...hourLogs, ...extras]) {
    const filePath = join(logDir, name);
    try {
      const fileMtimeMs = statSync(filePath).mtimeMs;
      const hit = parseFreenetLogPeerCount(tailFile(filePath, FREENET_LOG_TAIL_BYTES), {
        ...options,
        fileMtimeMs,
      });
      if (hit) return hit;
    } catch {
      /* unreadable file */
    }
  }
  return null;
}

/**
 * Newest hour logs only (same `--log-dir` as peer count). Last N this-node
 * PUT/GET lines. Never HTML, never `freenet.error.*`.
 */
export function readFreenetLogContractTraffic(
  logDir: string,
  options: ParseFreenetLogContractOptions = {},
): FreenetContractTrafficEvent[] {
  if (!logDir || !existsSync(logDir)) return [];
  let names: string[];
  try {
    names = readdirSync(logDir);
  } catch {
    return [];
  }
  const hourLogs = names.filter((name) => FREENET_LOG_HOUR_NAME.test(name)).sort().reverse().slice(0, 2);
  const found: FreenetContractTrafficEvent[] = [];
  for (const name of hourLogs) {
    const filePath = join(logDir, name);
    try {
      const fileMtimeMs = statSync(filePath).mtimeMs;
      found.push(
        ...parseFreenetLogContractTraffic(tailFile(filePath, FREENET_LOG_TAIL_BYTES), {
          ...options,
          fileMtimeMs,
        }),
      );
    } catch {
      /* unreadable file */
    }
  }
  return found;
}
