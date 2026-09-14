/**
 * Capacitor `FreenetHost` lifecycle — process start/stop/status/attach.
 *
 * The product path this slice (Plans/FREENET_NETWORK_PACK.md Phase 3) is
 * **attach-if-port-taken**: Freenet Android Node (or any node) already bound
 * on `127.0.0.1:7509`. The isolated `:freenet` process is how we eventually
 * drop that second APK; it must not block attach. AGPL stays in the other
 * process — PUF-AM talks loopback WS only.
 *
 * Safe to import from `lib/` (no React).
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

import { DEFAULT_LOCAL_FREENET_WS_URL } from '../../units/mist-freenet/src/freenet02-browser-get-url.ts';
import type {
  FreenetHostStatus,
  FreenetKillSwitchResult,
  FreenetLeftoverKind,
} from '../../units/puf-freenet-host/src/types.ts';

export const ANDROID_FREENET_HOST_ID = 'puf-freenet-host-android';
export const ANDROID_FREENET_WS_HOST = '127.0.0.1';
export const ANDROID_FREENET_WS_PORT = 7509;
/** Plans/FREENET_NETWORK_PACK.md Phase 3 — no official aarch64-linux-android asset. */
export const ANDROID_FREENET_NO_BINARY = 'no android-arm64 binary';

export type FreenetHostNative = {
  start(): Promise<FreenetHostStatus>;
  stop(): Promise<FreenetHostStatus>;
  stopAllOurs?: () => Promise<FreenetKillSwitchResult>;
  status(options?: { probe?: boolean }): Promise<FreenetHostStatus>;
  attach(): Promise<FreenetHostStatus>;
  openFreenetAndroidNode?: () => Promise<{ opened: boolean }>;
};

let native: FreenetHostNative | null | undefined;

function freenetHostNative(): FreenetHostNative | null {
  if (native !== undefined) return native;
  try {
    native = registerPlugin<FreenetHostNative>('FreenetHost');
    return native;
  } catch {
    native = null;
    return null;
  }
}

export function isFreenetHostPluginAvailable(): boolean {
  try {
    return (
      Capacitor.isNativePlatform() &&
      typeof Capacitor.isPluginAvailable === 'function' &&
      Capacitor.isPluginAvailable('FreenetHost')
    );
  } catch {
    return false;
  }
}

export function androidFreenetHostStatus(over: Partial<FreenetHostStatus> = {}): FreenetHostStatus {
  return {
    hostId: ANDROID_FREENET_HOST_ID,
    mode: 'stopped',
    reachable: false,
    wsUrl: DEFAULT_LOCAL_FREENET_WS_URL,
    wsHost: ANDROID_FREENET_WS_HOST,
    wsPort: ANDROID_FREENET_WS_PORT,
    configDir: '',
    dataDir: '',
    logDir: '',
    updateRequired: false,
    ...over,
  };
}

export function androidAttachedStatus(): FreenetHostStatus {
  return androidFreenetHostStatus({
    mode: 'attached',
    reachable: true,
    attachKind: 'foreign',
    binary: { path: 'loopback:7509', source: 'path' },
  });
}

export function androidMissingBinaryStatus(): FreenetHostStatus {
  return androidFreenetHostStatus({
    mode: 'failed',
    lastError: ANDROID_FREENET_NO_BINARY,
  });
}

function asStatus(raw: unknown): FreenetHostStatus {
  if (!raw || typeof raw !== 'object') return androidMissingBinaryStatus();
  const o = raw as Partial<FreenetHostStatus>;
  const status = androidFreenetHostStatus({
    ...o,
    hostId: o.hostId || ANDROID_FREENET_HOST_ID,
    wsUrl: o.wsUrl || DEFAULT_LOCAL_FREENET_WS_URL,
    wsHost: o.wsHost || ANDROID_FREENET_WS_HOST,
    wsPort: Number(o.wsPort) || ANDROID_FREENET_WS_PORT,
    ...(o.nodeRing ? { nodeRing: o.nodeRing } : {}),
    ...(o.contractTraffic ? { contractTraffic: o.contractTraffic } : {}),
    ...(o.leftover ? { leftover: o.leftover } : {}),
    ...(o.leftoverPackage ? { leftoverPackage: o.leftoverPackage } : {}),
  });
  // Same-uid leftover of our :freenet — reuse as managed, never “already open”.
  if (status.leftover === 'ours' && (status.reachable || status.mode === 'attached')) {
    return { ...status, mode: 'managed', lastError: undefined };
  }
  return status;
}

function asLeftover(raw: unknown): FreenetLeftoverKind {
  if (
    raw === 'ours' ||
    raw === 'android-node' ||
    raw === 'login-service' ||
    raw === 'foreign' ||
    raw === 'none'
  ) {
    return raw;
  }
  return 'none';
}

function asKillSwitch(raw: unknown): FreenetKillSwitchResult {
  const status = asStatus(raw);
  const o = raw && typeof raw === 'object' ? (raw as Partial<FreenetKillSwitchResult>) : {};
  const leftover = asLeftover(o.leftover ?? status.leftover);
  return {
    ...status,
    leftover,
    leftoverPackage: o.leftoverPackage ?? status.leftoverPackage,
    portFree: o.portFree ?? leftover === 'none',
    stoppedOurs: o.stoppedOurs === true,
  };
}

export async function androidFreenetHostStart(): Promise<FreenetHostStatus> {
  const plugin = isFreenetHostPluginAvailable() ? freenetHostNative() : null;
  if (!plugin) return androidMissingBinaryStatus();
  try {
    return asStatus(await plugin.start());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return androidFreenetHostStatus({
      mode: 'failed',
      lastError: message || ANDROID_FREENET_NO_BINARY,
    });
  }
}

export async function androidFreenetHostStop(): Promise<FreenetHostStatus> {
  const plugin = isFreenetHostPluginAvailable() ? freenetHostNative() : null;
  if (!plugin) return androidFreenetHostStatus();
  try {
    return asStatus(await plugin.stop());
  } catch {
    return androidFreenetHostStatus();
  }
}

export async function androidFreenetHostStatusNow(
  options: { probe?: boolean } = { probe: true },
): Promise<FreenetHostStatus> {
  const plugin = isFreenetHostPluginAvailable() ? freenetHostNative() : null;
  if (!plugin) return androidFreenetHostStatus();
  try {
    return asStatus(await plugin.status(options));
  } catch {
    return androidFreenetHostStatus();
  }
}

export async function androidFreenetHostStopAllOurs(): Promise<FreenetKillSwitchResult> {
  const plugin = isFreenetHostPluginAvailable() ? freenetHostNative() : null;
  if (!plugin?.stopAllOurs) {
    const after = await androidFreenetHostStop();
    return asKillSwitch({
      ...after,
      leftover: after.reachable ? after.leftover ?? 'foreign' : 'none',
      portFree: !after.reachable,
      stoppedOurs: after.mode === 'stopped',
    });
  }
  try {
    return asKillSwitch(await plugin.stopAllOurs());
  } catch {
    return asKillSwitch(androidFreenetHostStatus());
  }
}

export async function androidOpenFreenetAndroidNode(): Promise<boolean> {
  const plugin = isFreenetHostPluginAvailable() ? freenetHostNative() : null;
  if (!plugin?.openFreenetAndroidNode) return false;
  try {
    const result = await plugin.openFreenetAndroidNode();
    return result?.opened === true;
  } catch {
    return false;
  }
}

export async function androidFreenetHostAttach(): Promise<FreenetHostStatus> {
  const plugin = isFreenetHostPluginAvailable() ? freenetHostNative() : null;
  if (!plugin) return androidFreenetHostStatus({ lastError: 'FreenetHost plugin absent' });
  try {
    return asStatus(await plugin.attach());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return androidFreenetHostStatus({ mode: 'failed', lastError: message || 'attach failed' });
  }
}
