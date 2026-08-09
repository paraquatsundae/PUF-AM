/**
 * The tablet's side of the hub handshake: ask a hub what it is, and pair with it
 * if it wants a device token.
 *
 * Split from `hubIdentity.ts` on purpose. That module is the synchronous store
 * `apiBase.ts` reads while building a URL, so it must not reach the network or
 * import `apiBase` back. This one does both, and nothing in the request path
 * imports it.
 *
 * @see Plans/DESKTOP_FREENET_PLUGIN.md §6.4
 * @see Plans/APK_FREENET_PLUGIN.md §8a
 */

import { HUB_INFO_PATH, HUB_PAIR_PATH, isHubInfo, type HubInfo } from '../../shared/sync/hubInfo.ts';
import { normalizeHubBase } from './apiBase.ts';
import { getHubToken, saveHubCredential, forgetHubCredential } from './hubIdentity.ts';

const HANDSHAKE_TIMEOUT_MS = 4000;
const PAIR_TIMEOUT_MS = 8000;

async function timedFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `GET /api/hub/info`, cached on success.
 *
 * A hub that 404s this route is older than the handshake — a `npm run dev` from
 * before it landed, or a Cloud Run deployment. Treat that as "serves everything,
 * needs nothing", which is exactly what those hubs do, rather than refusing to
 * use them.
 */
export async function fetchHubInfo(base: string): Promise<HubInfo | null> {
  const hub = normalizeHubBase(base);
  if (!hub) return null;

  const token = getHubToken(hub);
  let res: Response;
  try {
    res = await timedFetch(
      `${hub}${HUB_INFO_PATH}`,
      {
        headers: {
          Accept: 'application/json',
          ...(token ? { 'x-puf-hub-token': token } : {}),
        },
      },
      HANDSHAKE_TIMEOUT_MS,
    );
  } catch {
    return null;
  }

  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as unknown;
  if (!isHubInfo(body)) return null;

  saveHubCredential(hub, { info: body });
  return body;
}

export type PairWithHubResult = {
  hub: string;
  info: HubInfo;
  deviceName: string;
};

/**
 * Exchange the code the operator read off the laptop for this device's token.
 *
 * The token is stored against the hub base, so a tablet that moves between two
 * sheds keeps both pairings. The pairing code is *not* stored — it is a one-time
 * introduction, and keeping it would turn a shoulder-surfable string into a
 * persistent credential on the tablet.
 */
export async function pairWithHub(
  base: string,
  code: string,
  deviceName?: string,
): Promise<PairWithHubResult> {
  const hub = normalizeHubBase(base);
  if (!hub) {
    throw new Error('That does not look like a hub address — try 192.168.1.20:3000.');
  }
  if (!code.trim()) {
    throw new Error('Enter the pairing code shown on the laptop, e.g. K7M2-9Q4X.');
  }

  const name = deviceName?.trim() || defaultDeviceName();

  let res: Response;
  try {
    res = await timedFetch(
      `${hub}${HUB_PAIR_PATH}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ code: code.trim(), deviceName: name }),
      },
      PAIR_TIMEOUT_MS,
    );
  } catch {
    throw new Error(
      `Nothing answered at ${hub}. Check the laptop is on this Wi‑Fi and that ` +
        'PUF-AM there has the tablet hub switched on.',
    );
  }

  const body = (await res.json().catch(() => ({}))) as {
    token?: string;
    deviceName?: string;
    hub?: unknown;
    error?: string;
  };

  if (res.status === 404) {
    // Not a pairing hub at all — an older `npm run dev`, which needs no token.
    throw new Error(
      `${hub} is not a PUF-AM desktop hub, so it needs no pairing code. Use it directly.`,
    );
  }
  if (!res.ok || !body.token) {
    throw new Error(body.error || `Pairing failed (${res.status}).`);
  }

  const info = isHubInfo(body.hub) ? body.hub : await fetchHubInfo(hub);
  saveHubCredential(hub, {
    token: body.token,
    pairedAt: new Date().toISOString(),
    ...(info ? { info } : {}),
  });

  return {
    hub,
    deviceName: body.deviceName || name,
    info:
      info ??
      // The hub answered the pairing but not the description. We know it wanted a
      // token, so record that much rather than the permissive default.
      {
        product: 'PUF-AM',
        kind: 'desktop-lan',
        name: hub,
        pairingRequired: true,
        paired: true,
        cloudOnlyPrefixes: ['/api/auth/', '/api/weather/'],
        cloudApiBase: '',
        lanScopePrefixes: [],
        freenet: false,
      },
  };
}

/** Forget a hub entirely — used when the operator re-pairs or the token is rejected. */
export function unpairHub(base: string): void {
  const hub = normalizeHubBase(base);
  if (hub) forgetHubCredential(hub);
}

/** Something the operator will recognise in the laptop's paired-device list. */
export function defaultDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Tablet';
  const ua = navigator.userAgent || '';
  const model = /Android[^;]*;\s*([^)]+?)(?:\s+Build|\))/.exec(ua)?.[1]?.trim();
  return model || 'Tablet';
}
