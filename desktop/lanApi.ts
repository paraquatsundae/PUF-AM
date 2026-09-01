/**
 * The desktop shell's **LAN** listener — what makes a running AppImage usable as
 * the shed's tablet hub (plan §6.4).
 *
 * This is a *second* listener, deliberately not the loopback one. The loopback
 * listener serves the built UI same-origin on an ephemeral port behind a
 * per-launch token that never leaves the process; widening it to `0.0.0.0` would
 * have meant either publishing that token or dropping the guard. Instead:
 *
 * | | loopback (`localApi.ts`) | LAN (this file) |
 * |--|--|--|
 * | Bind | `127.0.0.1:<ephemeral>` | `0.0.0.0:<stable port>` |
 * | Serves the UI | yes | **no** — API only |
 * | Credential | per-launch token, session-injected | paired device token |
 * | Routes | all of `createApiApp()` | `LAN_SCOPE_PREFIXES` only |
 *
 * The port is stable rather than ephemeral because a tablet may have to be told
 * it by hand when multicast is blocked, and an address the operator has to re-read
 * every launch is not one they will use.
 *
 * `createApiApp()` is instantiated twice in this process, but the state behind it
 * — the join-ticket shelf, the mDNS registry, the Freenet peer host — is
 * module-level and therefore shared. That is what lets a ticket registered by the
 * desktop UI over loopback resolve for a tablet over the LAN.
 */

import type { AddressInfo } from 'node:net';
import { hostname as osHostname } from 'node:os';

import express from 'express';

import { socketPeerIp } from '../server/clientIp.ts';
import { apiCorsMiddleware, createApiApp } from '../server/createApiApp.ts';
import { HUB_INFO_PATH, HUB_PAIR_PATH, type HubInfo } from '../shared/sync/hubInfo.ts';
import {
  HUB_CLOUD_ONLY_PREFIXES,
  LAN_HUB_DEFAULT_PORT,
  LAN_SCOPE_PREFIXES,
  PairingThrottle,
  decideLanRequest,
  isPairableRemoteAddress,
  mintDeviceToken,
  hashDeviceToken,
  newDeviceId,
  pairingCodesMatch,
  presentedHubToken,
  sanitizeDeviceName,
  findDeviceByToken,
  type LanHubDevice,
} from './lanHubAuth.ts';

/** Tried in order when the preferred port is taken — usually by a `npm run dev` on the same box. */
export const LAN_HUB_PORT_ATTEMPTS = 10;

export type LanApiHandle = {
  /** `http://<lan-ip>:<port>`, or the loopback form when no LAN address exists yet. */
  baseUrl: string;
  port: number;
  host: string;
  close(): Promise<void>;
};

export type LanApiOptions = {
  host?: string;
  /** Preferred port; the listener walks upwards if it is taken. */
  port?: number;
  /** Read live so rotating the code in Settings takes effect without a restart. */
  pairingCode(): string;
  devices(): readonly LanHubDevice[];
  /** Persist a newly paired device. Returns the list the guard should use next. */
  onPaired(device: LanHubDevice): void;
  /** Bump `lastSeenAt` so the operator can tell a live tablet from a stale entry. */
  onDeviceSeen?(deviceId: string): void;
  /** Advertised in `/api/hub/info` — the tablet re-points these at the cloud. */
  cloudApiBase(): string;
  /** Whether the Freenet relay is actually usable right now. */
  freenetReady(): boolean;
  /** `http://<lan-ip>:<port>` for the operator-facing name; resolved by main. */
  lanAddress?(): string | undefined;
  /**
   * This install's stable identity, so a tablet that paired on the shed Wi‑Fi
   * recognises the same hub at its VPN address instead of pairing twice.
   */
  hubId?(): string;
};

/**
 * The socket peer, never `X-Forwarded-For`. Nothing proxies this hub — it is an
 * Express server on a laptop on the shed Wi‑Fi — so the header here could only
 * have come from the tablet being limited.
 */
function clientKey(req: express.Request): string {
  return socketPeerIp(req);
}

function hubName(): string {
  return `PUF-AM (${osHostname().split('.')[0] || 'laptop'})`;
}

/**
 * Bind the first free port at or above `preferred`.
 *
 * A developer with `npm run dev` already on 3000 is the common case, and failing
 * the whole LAN hub over it would be a poor trade — but the port has to be
 * *reported*, because a tablet typing the address by hand needs the real one.
 */
function listenFrom(
  app: express.Express,
  host: string,
  preferred: number,
  attempts: number,
): Promise<{ server: import('node:http').Server; port: number }> {
  return new Promise((resolve, reject) => {
    const tryPort = (port: number, left: number) => {
      const server = app.listen(port, host);
      server.once('listening', () => {
        const address = server.address() as AddressInfo | null;
        if (!address) {
          server.close();
          reject(new Error('LAN API failed to report a listening address'));
          return;
        }
        resolve({ server, port: address.port });
      });
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && left > 0) {
          tryPort(port + 1, left - 1);
          return;
        }
        reject(err);
      });
    };
    tryPort(preferred, attempts);
  });
}

export async function startLanApi(options: LanApiOptions): Promise<LanApiHandle> {
  const host = options.host ?? '0.0.0.0';
  const preferred = options.port && options.port > 0 ? options.port : LAN_HUB_DEFAULT_PORT;
  const throttle = new PairingThrottle();

  const app = express();
  // Hub surface: this listener exists for paired tablets on the shed Wi-Fi, so
  // `capacitor://localhost` and the loopback origins have to be allowed.
  app.use(apiCorsMiddleware('hub'));
  app.use(express.json({ limit: '1mb' }));

  const describeHub = (req: express.Request): HubInfo => ({
    product: 'PUF-AM',
    kind: 'desktop-lan',
    name: hubName(),
    ...(options.hubId?.() ? { hubId: options.hubId() } : {}),
    pairingRequired: true,
    paired: Boolean(findDeviceByToken(options.devices(), presentedHubToken(req.headers))),
    cloudOnlyPrefixes: [...HUB_CLOUD_ONLY_PREFIXES],
    cloudApiBase: options.cloudApiBase(),
    lanScopePrefixes: [...LAN_SCOPE_PREFIXES],
    freenet: options.freenetReady(),
    tiles: true,
  });

  app.get(HUB_INFO_PATH, (req, res) => {
    res.json(describeHub(req));
  });

  /**
   * Exchange the operator-read pairing code for a device token.
   *
   * No farm membership check, for the same reason join tickets have none: a mist
   * farm has no Firebase identity to check against, and the operator reading the
   * code out *is* the authorisation. What the code buys is scoped LAN access to
   * this hub, not the farm — the farm still needs its FarmCode and device PIN.
   */
  app.post(HUB_PAIR_PATH, (req, res) => {
    const key = clientKey(req);
    if (!isPairableRemoteAddress(key)) {
      return res.status(403).json({
        error:
          'PUF-AM hubs only pair with devices on this network or on the farm VPN. ' +
          'Put the tablet on the shed Wi‑Fi, or on the same tailnet as this laptop, and pair once.',
      });
    }

    const retryMs = throttle.retryAfterMs(key);
    if (retryMs > 0) {
      res.setHeader('Retry-After', String(Math.ceil(retryMs / 1000)));
      return res.status(429).json({
        error:
          `Too many wrong pairing codes from this device — wait ${Math.ceil(retryMs / 60000)} ` +
          'minute(s), or rotate the code on the laptop.',
      });
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const expected = options.pairingCode();
    if (!expected) {
      return res.status(503).json({
        error: 'This hub has no pairing code yet — enable the tablet hub in Settings on the laptop.',
      });
    }
    if (!pairingCodesMatch(expected, body.code)) {
      throttle.recordFailure(key);
      return res.status(401).json({ error: 'That pairing code does not match this hub.' });
    }

    throttle.clear(key);
    const token = mintDeviceToken();
    const device: LanHubDevice = {
      id: newDeviceId(),
      name: sanitizeDeviceName(body.deviceName),
      tokenHash: hashDeviceToken(token),
      pairedAt: new Date().toISOString(),
    };
    options.onPaired(device);
    console.log(`[lan-hub] paired "${device.name}" from ${key}`);

    return res.json({
      token,
      deviceId: device.id,
      deviceName: device.name,
      hub: { ...describeHub(req), paired: true },
    });
  });

  app.use((req, res, next) => {
    const verdict = decideLanRequest(
      { method: req.method, path: req.path, headers: req.headers },
      options.devices(),
    );
    if (verdict.kind === 'allow') {
      if (verdict.device) options.onDeviceSeen?.(verdict.device.id);
      next();
      return;
    }
    if (verdict.kind === 'out-of-scope') {
      res.status(404).json({ error: verdict.message });
      return;
    }
    res.status(401).json({ error: verdict.message, pairingRequired: true });
  });

  // Hub surface — the LAN families are the point of this listener. The scope
  // guard above has already restricted what a paired tablet may reach.
  app.use(createApiApp({ surface: 'hub' }));

  const { server, port } = await listenFrom(app, host, preferred, LAN_HUB_PORT_ATTEMPTS);
  const lanIp = options.lanAddress?.();

  return {
    baseUrl: `http://${lanIp || '127.0.0.1'}:${port}`,
    port,
    host,
    close: () =>
      new Promise<void>((done) => {
        server.close(() => done());
      }),
  };
}
