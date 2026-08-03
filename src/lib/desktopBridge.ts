/**
 * Renderer view of the Electron preload bridge (`window.pufamDesktop`).
 *
 * Web, Cloud Run, and Capacitor builds never see this object, so every accessor
 * here must be safe to call — and give a web-shaped answer — when it is absent.
 * The renderer keeps `contextIsolation` on and no Node access; this is the whole
 * surface. See `Plans/DESKTOP_FREENET_PLUGIN.md` §6.2.
 */

import type { FreenetHostStatus } from '../../units/puf-freenet-host/src/types.ts';

export type DesktopFreenetBridge = {
  status(): Promise<FreenetHostStatus | null>;
  start(): Promise<FreenetHostStatus | null>;
  stop(): Promise<FreenetHostStatus | null>;
  /** Subscribe to host state changes. Returns an unsubscribe function. */
  onState(listener: (status: FreenetHostStatus) => void): () => void;
};

export type DesktopBridge = {
  isDesktop: true;
  /** Base for routes needing server-only secrets (`/api/auth/*`, `/api/weather/*`). */
  cloudApiBase: string;
  /** Base for `/api/mist/freenet/*`. Empty string = same-origin loopback. */
  freenetApiBase: string;
  mistEnabled: boolean;
  platform: string;
  freenet: DesktopFreenetBridge;
};

declare global {
  interface Window {
    pufamDesktop?: DesktopBridge;
  }
}

export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = window.pufamDesktop;
  return bridge?.isDesktop === true ? bridge : null;
}

export function isDesktopShell(): boolean {
  return getDesktopBridge() !== null;
}
