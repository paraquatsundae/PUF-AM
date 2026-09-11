/**
 * Renderer view of the Electron preload bridge (`window.pufamDesktop`).
 *
 * Web, Cloud Run, and Capacitor builds never see this object, so every accessor
 * here must be safe to call — and give a web-shaped answer — when it is absent.
 * The renderer keeps `contextIsolation` on and no Node access; this is the whole
 * surface. See `Plans/reference/DESKTOP_FREENET_PLUGIN.md` §6.2.
 */

import type {
  FreenetHostStatus,
  FreenetPutCiphertextResult,
  FreenetSlotPutInput,
  FreenetSlotPutResult,
} from '../../units/puf-freenet-host/src/types.ts';

/**
 * `FreenetHostPlugin` as the renderer sees it — lifecycle plus the data path
 * (Plans/FREENET_NETWORK_PACK.md decision 2; channels `puf-freenet:*`). The
 * four data members are optional in the type so a renderer can tell a shell
 * built before slice B apart from one that has them, and fall back to the relay.
 */
export type DesktopFreenetBridge = {
  status(): Promise<FreenetHostStatus | null>;
  start(): Promise<FreenetHostStatus | null>;
  stop(): Promise<FreenetHostStatus | null>;
  /** Subscribe to host state changes. Returns an unsubscribe function. */
  onState(listener: (status: FreenetHostStatus) => void): () => void;
  /** Ciphertext only — main refuses anything that is not an AEAD envelope. `key` is the mist storage key, used as the guard's kind hint. */
  put?(args: { bytes: Uint8Array; key?: string }): Promise<FreenetPutCiphertextResult>;
  get?(uri: string): Promise<Uint8Array | null>;
  slotPut?(args: FreenetSlotPutInput): Promise<FreenetSlotPutResult>;
  slotGet?(instanceIdBase58: string): Promise<Uint8Array | null>;
};

export type DesktopMistPreference = {
  /** The saved opt-in — what the Settings toggle reflects across launches. */
  enabled: boolean;
  /** `MIST_FREENET` in the environment forces mist on for this launch only. */
  forcedByEnv: boolean;
};

export type DesktopMistBridge = {
  getPreference(): Promise<DesktopMistPreference>;
  /** Persists the opt-in and brings the node up (or down) without a relaunch. */
  setPreference(
    enabled: boolean,
  ): Promise<DesktopMistPreference & { host: FreenetHostStatus | null }>;
};

/** A paired tablet, as the desktop Settings card lists it. No token material. */
export type DesktopLanHubDevice = {
  id: string;
  name: string;
  pairedAt: string;
  lastSeenAt?: string;
};

export type DesktopLanHubState = {
  enabled: boolean;
  /** `PUF_LAN_HUB=1` forced it on for this launch. */
  forcedByEnv: boolean;
  running: boolean;
  port: number;
  /** Every address a tablet could type, best first. Empty until the listener is up. */
  baseUrls: string[];
  /** `XXXX-XXXX` — read out to the tablet once. Empty before the first enable. */
  pairingCode: string;
  advertising: boolean;
  lastError: string | null;
  devices: DesktopLanHubDevice[];
};

export type DesktopLanHubBridge = {
  state(): Promise<DesktopLanHubState>;
  setEnabled(enabled: boolean): Promise<DesktopLanHubState>;
  rotatePairingCode(): Promise<DesktopLanHubState>;
  forgetDevice(deviceId: string): Promise<DesktopLanHubState>;
  onState(listener: (state: DesktopLanHubState) => void): () => void;
};

export type DesktopBridge = {
  isDesktop: true;
  /** Base for routes needing server-only secrets (`/api/auth/*`, `/api/weather/*`). */
  cloudApiBase: string;
  /** Base for `/api/mist/freenet/*`. Empty string = same-origin loopback. */
  freenetApiBase: string;
  /** Whether mist was on at launch. Live state comes from `mist.getPreference()`. */
  mistEnabled: boolean;
  platform: string;
  mist?: DesktopMistBridge;
  /** Absent on a shell built before the LAN hub landed — callers must check. */
  lanHub?: DesktopLanHubBridge;
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
