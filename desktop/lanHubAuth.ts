/**
 * Authorisation for the desktop shell's **LAN** listener — plan §6.4.
 *
 * The loopback listener's per-launch token (`loopbackAuth.ts`) deliberately never
 * leaves the process: the session injects it into renderer requests and nothing
 * else can obtain it. A tablet is a different machine, so it needs a credential
 * it can be *given* once and then keep. Publishing the loopback token on
 * `0.0.0.0` would have been the same secret with a much larger blast radius.
 *
 * The model is therefore **pairing code → per-device token**:
 *
 *   1. The hub shows a short pairing code in Settings (`XXXX-XXXX`). It is
 *      persisted, so the shed laptop's code does not change every launch — a
 *      per-launch code would mean re-pairing every tablet every morning.
 *   2. The tablet posts the code once to `/api/hub/pair` and gets back a 256-bit
 *      device token, which it stores. Only the SHA-256 of that token is written
 *      to `desktop-prefs.json`, so a readable prefs file does not hand out hub
 *      access.
 *   3. Every later `/api/*` call carries the token. The code is not reusable as a
 *      request credential, so a shoulder-surfed code is only worth something
 *      while the operator has pairing switched on.
 *
 * Two things bound what a paired device can do, and both are checked here rather
 * than trusted to the route table:
 *
 * - **Scope.** Only the families a tablet actually needs are reachable over the
 *   LAN (`LAN_SCOPE_PREFIXES`). `/api/auth/*` and `/api/weather/*` are not among
 *   them — a packaged desktop has no Firebase service account or `DPIRD_API_KEY`
 *   to serve them with anyway, and an allowlist means a route added later is
 *   LAN-invisible until somebody decides otherwise.
 * - **Brute force.** 40 bits of pairing code is plenty against a human and
 *   nothing against a script on the same Wi‑Fi, so failed pairing attempts are
 *   throttled per client.
 *
 * Imports nothing from `electron` or `express` so it stays testable in plain Node.
 */

import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** Not `Authorization`: `/api/sync/*` already carries farm bearers there. */
export const HUB_TOKEN_HEADER = 'x-puf-hub-token';

/**
 * Where a tablet expects a PUF-AM hub, because `npm run dev` has always been
 * here. Stable rather than ephemeral: an operator may have to type this address
 * when multicast is blocked, and one that changes every launch is one they will
 * not use.
 */
export const LAN_HUB_DEFAULT_PORT = 3000;

/**
 * Reachable without a device token. `/api/hub/pair` cannot require one (it is how
 * you get one) and `/api/health` is what every discovery path probes with — a
 * guarded health check would make an unpaired tablet unable to tell a live hub
 * from a wrong address.
 */
export const LAN_OPEN_PATHS: readonly string[] = [
  '/api/health',
  '/api/hub/info',
  '/api/hub/pair',
];

/**
 * What a paired device may reach. Everything a tablet does over the LAN today:
 * `.pufom` push/pull and peer listing, join-ticket register/resolve, crew
 * presence and highlights, and the Freenet relay that makes this laptop's node
 * usable from a tablet (`APK_FREENET_PLUGIN.md` §8 Phase 2).
 */
export const LAN_SCOPE_PREFIXES: readonly string[] = [
  '/api/sync/',
  '/api/presence/',
  '/api/highlights/',
  '/api/mist/freenet/',
];

/**
 * Served by the cloud even for a paired tablet, because a packaged desktop has no
 * secret to serve them with. Reported in `/api/hub/info` so the tablet re-points
 * these itself instead of collecting 401s from a hub that was never going to
 * answer. Matches `DESKTOP_CLOUD_ONLY_PREFIXES` in `src/lib/apiBase.ts`.
 */
export const HUB_CLOUD_ONLY_PREFIXES: readonly string[] = [
  '/api/auth/',
  '/api/weather/',
  '/api/admin/',
];

/** Unambiguous on a whiteboard and over a phone: no I, L, O, U. */
const PAIRING_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PAIRING_CODE_LENGTH = 8;

const PAIRING_MAX_FAILURES = 5;
const PAIRING_LOCKOUT_MS = 10 * 60 * 1000;

export type LanHubDevice = {
  id: string;
  /** Operator-facing label so a lost tablet can be revoked by name. */
  name: string;
  /** SHA-256 of the token. The token itself is never persisted. */
  tokenHash: string;
  pairedAt: string;
  lastSeenAt?: string;
};

/**
 * `XXXX-XXXX` from the CSPRNG. `randomInt` rather than `randomBytes % 32` — the
 * modulus is exact here, but the biased-shuffle habit is how these go wrong.
 */
export function mintPairingCode(): string {
  let raw = '';
  for (let i = 0; i < PAIRING_CODE_LENGTH; i += 1) {
    raw += PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/**
 * Accept what an operator will actually type: lower case, no dash, spaces, and
 * the four characters the alphabet omits folded onto the ones they look like.
 */
export function normalizePairingCode(raw: unknown): string {
  const cleaned = String(raw ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/U/g, 'V');
  if (cleaned.length !== PAIRING_CODE_LENGTH) return '';
  if (![...cleaned].every((ch) => PAIRING_ALPHABET.includes(ch))) return '';
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
}

export function pairingCodesMatch(expected: string, presented: unknown): boolean {
  const a = normalizePairingCode(expected);
  const b = normalizePairingCode(presented);
  if (!a || !b) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/** 256 bits, handed to the device once and never written to disk in the clear. */
export function mintDeviceToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function newDeviceId(): string {
  return randomBytes(8).toString('hex');
}

/**
 * This install's `hubId` (`shared/sync/hubInfo.ts`).
 *
 * Random rather than derived from the hostname or a MAC: it is published
 * unauthenticated in `/api/hub/info`, so it must say *this is the same hub you
 * paired with* and nothing else about the machine.
 */
export function mintHubId(): string {
  return randomBytes(16).toString('hex');
}

export function isHubId(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[0-9a-f]{32}$/.test(raw);
}

/**
 * May a device at this address exchange a pairing code for a token?
 *
 * Pairing is deliberately not reachable from the open internet: the code is 40
 * bits, and an address that arbitrary hosts can reach turns a throttle into the
 * only thing standing between a shed laptop and a farm. Everything below is a
 * network the operator is already inside — the shed LAN, loopback, or the farm's
 * own VPN.
 *
 * **`100.64.0.0/10` is included** because that is where a Tailscale/WireGuard
 * peer appears, and reaching the hub over the farm's tailnet is the whole point
 * of a remote gateway (`Plans/APK_FREENET_PLUGIN.md` §8d). It is carrier-grade
 * NAT space, so in principle an ISP could place a stranger there — but only on an
 * interface this listener is bound to, and pairing still needs the code off the
 * laptop's screen and still counts failures per client.
 */
export function isPairableRemoteAddress(raw: string): boolean {
  const addr = String(raw ?? '').replace(/^::ffff:/, '');
  if (addr === '127.0.0.1' || addr === '::1' || addr === 'localhost') return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(addr)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(addr)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(addr)) return true;
  if (/^169\.254\./.test(addr)) return true;
  // 100.64.0.0/10 — CGNAT, where a Tailscale peer lives.
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(addr)) return true;
  // fe80::/10 link-local, fc00::/7 unique-local (Tailscale's fd7a:115c:a1e0::/48)
  if (/^fe[89ab]/i.test(addr) || /^f[cd]/i.test(addr)) return true;
  return false;
}

/** A tablet's own name is untrusted display text, so bound its length and strip control chars. */
export function sanitizeDeviceName(raw: unknown): string {
  const name = String(raw ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, 48);
  return name || 'Tablet';
}

export function findDeviceByToken(
  devices: readonly LanHubDevice[],
  token: string,
): LanHubDevice | null {
  if (!token) return null;
  const presented = Buffer.from(hashDeviceToken(token), 'hex');
  for (const device of devices) {
    let stored: Buffer;
    try {
      stored = Buffer.from(device.tokenHash, 'hex');
    } catch {
      continue;
    }
    if (stored.length !== presented.length) continue;
    if (timingSafeEqual(stored, presented)) return device;
  }
  return null;
}

export type LanHeaders = Record<string, string | string[] | undefined>;

function headerValue(headers: LanHeaders, name: string): string | undefined {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(raw) ? raw[0] : raw;
}

export function presentedHubToken(headers: LanHeaders): string {
  const direct = headerValue(headers, HUB_TOKEN_HEADER);
  if (direct) return direct.trim();

  // A `curl` from the workshop is easier with a bearer, and `/api/sync/*` farm
  // bearers are a different shape, so an accidental collision fails closed.
  const auth = headerValue(headers, 'authorization')?.trim() ?? '';
  return /^bearer /i.test(auth) ? auth.slice(7).trim() : '';
}

export type LanRequest = {
  method: string;
  path: string;
  headers: LanHeaders;
};

export type LanVerdict =
  | { kind: 'allow'; device?: LanHubDevice }
  /** Path is not in the LAN scope at all — no token would help. */
  | { kind: 'out-of-scope'; message: string }
  | { kind: 'unpaired'; message: string };

export const LAN_OUT_OF_SCOPE_MESSAGE =
  'This PUF-AM hub does not serve that route on the local network. ' +
  'Farm sync, join tickets, crew presence and Freenet are the LAN routes; ' +
  'sign-in and weather come from the cloud.';

export const LAN_UNPAIRED_MESSAGE =
  'Pair this device with the hub first: on the laptop open ' +
  'Settings → Offline & sync → Tablet hub, read the pairing code, and enter it here.';

/**
 * One decision for every LAN request. Non-`/api` paths are refused rather than
 * falling through to static files: the LAN listener is an API, and serving the
 * built bundle over it would put an unauthenticated copy of the UI on the shed
 * Wi‑Fi for no gain (the tablet already has its own).
 */
export function decideLanRequest(
  req: LanRequest,
  devices: readonly LanHubDevice[],
): LanVerdict {
  if (!req.path.startsWith('/api/') && req.path !== '/api') {
    return { kind: 'out-of-scope', message: LAN_OUT_OF_SCOPE_MESSAGE };
  }
  // A preflight cannot carry the token, so rejecting it would fail the request
  // that follows rather than the one being checked.
  if (req.method === 'OPTIONS') return { kind: 'allow' };
  if (LAN_OPEN_PATHS.includes(req.path)) return { kind: 'allow' };

  if (!LAN_SCOPE_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
    return { kind: 'out-of-scope', message: LAN_OUT_OF_SCOPE_MESSAGE };
  }

  const device = findDeviceByToken(devices, presentedHubToken(req.headers));
  if (!device) return { kind: 'unpaired', message: LAN_UNPAIRED_MESSAGE };
  return { kind: 'allow', device };
}

/**
 * Per-client failure counter for `/api/hub/pair`.
 *
 * In memory on purpose: a lockout that survives a relaunch would be a way to
 * lock the operator's own tablet out of a hub they control, and the code is
 * rotatable anyway.
 */
export class PairingThrottle {
  private readonly failures = new Map<string, { count: number; until: number }>();

  constructor(
    private readonly maxFailures = PAIRING_MAX_FAILURES,
    private readonly lockoutMs = PAIRING_LOCKOUT_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Milliseconds left on a lockout, or 0 when the client may try. */
  retryAfterMs(key: string): number {
    const entry = this.failures.get(key);
    if (!entry) return 0;
    if (entry.count < this.maxFailures) return 0;
    const left = entry.until - this.now();
    if (left > 0) return left;
    this.failures.delete(key);
    return 0;
  }

  recordFailure(key: string): void {
    const entry = this.failures.get(key) ?? { count: 0, until: 0 };
    entry.count += 1;
    entry.until = this.now() + this.lockoutMs;
    this.failures.set(key, entry);
  }

  clear(key: string): void {
    this.failures.delete(key);
  }
}
