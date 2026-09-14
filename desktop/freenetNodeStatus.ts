/**
 * Loopback JSON status + this bake's `--log-dir` peer count — Electron main.
 *
 * Tries `GET /status` then `GET /v1/status`. Accepts JSON; refuses HTML
 * (0.2.135's dashboard). 0.2.135 has no peer JSON — N comes from the latest
 * `ring_connections=` / `connection_count=` in `logDir`. Also reads
 * `GET /v1/version`. No new IPC channel — `readFreenetStatus` merges this on.
 *
 * Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-14 (peer count from logs).
 */

import {
  looksLikeHtmlStatusBody,
  mergeFreenetRingFromLog,
  mergeNodeVersion,
  parseFreenetNodeStatusJson,
  readFreenetLogPeerCount,
  type FreenetNodeRingInfo,
} from '../units/puf-freenet-host/src/index.ts';

const STATUS_PATHS = ['/status', '/v1/status'] as const;
const VERSION_PATH = '/v1/version';
const FETCH_MS = 1_200;

async function getText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(FETCH_MS),
      headers: { accept: 'application/json, text/plain;q=0.1' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function parseJsonBody(text: string): unknown | null {
  if (!text || looksLikeHtmlStatusBody(text)) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** Best-effort ring snapshot from the node on this machine. Never invents peers. */
export async function fetchFreenetNodeRing(
  wsHost: string,
  wsPort: number,
  logDir?: string,
): Promise<FreenetNodeRingInfo | undefined> {
  const origin = `http://${wsHost}:${wsPort}`;
  let ring: FreenetNodeRingInfo | undefined;
  for (const path of STATUS_PATHS) {
    const text = await getText(`${origin}${path}`);
    if (!text) continue;
    const parsed = parseFreenetNodeStatusJson(parseJsonBody(text));
    if (parsed) {
      ring = parsed;
      break;
    }
  }
  const versionText = await getText(`${origin}${VERSION_PATH}`);
  if (versionText) {
    ring = mergeNodeVersion(ring, parseJsonBody(versionText));
  }
  if (logDir) {
    ring = mergeFreenetRingFromLog(ring, readFreenetLogPeerCount(logDir));
  }
  return ring;
}
