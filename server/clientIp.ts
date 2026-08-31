/**
 * Who is calling, for rate-limiting and LAN gating.
 *
 * `X-Forwarded-For` is a list the caller can start. Anyone may send
 * `X-Forwarded-For: 1.2.3.4`, and a proxy in front of us appends to that list
 * rather than replacing it, so the *leftmost* entry is whatever the caller
 * decided to claim. Reading it — which `clientKey` used to do — gave every
 * limiter on this server a key the attacker chooses, so `redeem-pin` at 30 per
 * 15 minutes was really 30 per header value.
 *
 * The fix is to read from the right. Each proxy appends the address it accepted
 * the connection from, so the real caller is near the end and everything left
 * of it is unverifiable. Which entry exactly is decided by
 * `trustedProxyRanges` — by recognising the proxy, not by counting hops, since
 * this process serves both a two-hop path through Firebase Hosting and a
 * one-hop path on the open `run.app` origin.
 *
 * Deliberately *not* `app.set('trust proxy')`. That setting rewrites `req.ip`
 * process-wide, and `joinTicketRoutes` gates four LAN-only endpoints on
 * `isPrivateHost(req.ip)`. Making `req.ip` header-derived would turn those into
 * an authorization bypass — `X-Forwarded-For: 192.168.1.50` from the internet
 * would read as a tablet in the shed. Rate limiting wants the forwarded
 * address, those gates want the socket peer, so the two are separate calls here
 * and each caller says which one it means.
 */
import type { Request } from 'express';

import { isTrustedProxyAddress } from './trustedProxyRanges.ts';

/** Node reports IPv4 peers on a dual-stack socket as `::ffff:203.0.113.7`. */
const IPV4_MAPPED = /^::ffff:/i;

let warnedInvalidHops = false;

/**
 * An explicit hop count, when the operator has one worth stating.
 *
 * Only useful where the proxy chain is a known fixed depth — the HTTPS load
 * balancer path in `Plans/DEPLOY_CLOUD_RUN.md`, with `run.app` ingress closed.
 * Unset (the normal case) means recognise proxies by address instead, which is
 * what the live Firebase Hosting deployment needs.
 */
function configuredHops(): number | null {
  const raw = process.env.TRUSTED_PROXY_HOPS?.trim();
  if (!raw) return null;

  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed >= 0) return parsed;

  if (!warnedInvalidHops) {
    warnedInvalidHops = true;
    console.warn(`[clientIp] Ignoring TRUSTED_PROXY_HOPS=${raw}: expected a non-negative integer.`);
  }
  return null;
}

/** Set by Cloud Run itself, so nothing needs wiring in the deploy script. */
function behindKnownProxy(): boolean {
  return Boolean(process.env.K_SERVICE);
}

export function forwardedChain(req: Request): string[] {
  const header = req.headers['x-forwarded-for'];
  return (Array.isArray(header) ? header.join(',') : String(header || ''))
    .split(',')
    .map(normalize)
    .filter(Boolean);
}

function normalize(value: string): string {
  return value.trim().replace(IPV4_MAPPED, '');
}

/**
 * The address on the other end of the TCP connection.
 *
 * Cannot be forged by a header, which is what the LAN-only join-ticket gates
 * need: on a hub bound to `0.0.0.0`, "is this caller on my network" has to mean
 * the socket and nothing else.
 */
export function socketPeerIp(req: Request): string {
  return normalize(String(req.socket?.remoteAddress || '')) || 'unknown';
}

/**
 * The caller's address as vouched for by our own proxies, for rate-limit keys.
 *
 * Walks the chain from the right, discarding entries that belong to a proxy we
 * recognise, and takes the first one that does not. That resolves both live
 * shapes with no configuration: via Firebase Hosting the edge is skipped and
 * the caller behind it is returned, while a direct `run.app` hit has no edge to
 * skip and the last entry — the address Cloud Run itself accepted — is already
 * the caller. Forged entries are always further left than a real one, so they
 * are never reached.
 *
 * Falls back to the socket peer when nothing usable is left. Off Cloud Run
 * nothing proxies us at all, so the header is ignored outright.
 */
export function clientIp(req: Request): string {
  const hops = configuredHops();
  const chain = forwardedChain(req);

  if (hops !== null) {
    if (hops <= 0) return socketPeerIp(req);
    return chain[chain.length - hops] || socketPeerIp(req);
  }

  if (!behindKnownProxy()) return socketPeerIp(req);

  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const entry = chain[i] as string;
    if (!isTrustedProxyAddress(entry)) return entry;
  }
  return socketPeerIp(req);
}
