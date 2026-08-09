/**
 * The loopback port the desktop UI is served from.
 *
 * Its own module, tiny and dependency-free, because two very different things
 * need it: `localApi.ts`, which binds it and drags in Express and every API
 * route with it, and `desktopPrefs.ts`, which only has to coerce a number and
 * is deliberately testable in plain Node.
 *
 * Why the port is a *preference* rather than an implementation detail:
 * Chromium partitions `localStorage` and IndexedDB by origin, and the
 * renderer's origin is `http://127.0.0.1:<port>`. An ephemeral port is a new
 * origin every launch, which is a new empty storage bucket every launch — see
 * the note in `localApi.ts`.
 */

/**
 * Clear of 3000 (the LAN hub and `npm run dev`) and of 7509 (the Freenet
 * websocket), so the ordinary workshop case is a first-try bind and the origin
 * never moves.
 */
export const APP_LOCAL_PORT_DEFAULT = 7520;

/** How far to walk when the saved port has been taken by something else. */
export const APP_LOCAL_PORT_ATTEMPTS = 20;

/** Ports the OS lets an unprivileged process bind, minus the ephemeral range. */
export function isUsableAppPort(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1024 && (value as number) <= 65535;
}

export function coerceAppPort(raw: unknown): number {
  const port = Number(raw);
  return isUsableAppPort(port) ? port : APP_LOCAL_PORT_DEFAULT;
}
