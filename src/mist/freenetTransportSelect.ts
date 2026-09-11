/**
 * Which transport this shell uses — decided from the host capability
 * (Plans/NETWORK_PACK_PLUGIN.md § Host capability) on every call, because the
 * probes are cheap and a cached answer would outlive a test's stubbed shell.
 *
 * `'electron'` with a preload that exposes the data channels → the host
 * transport; anything else → the relay. The rule itself is
 * `selectFreenetTransportKind` in `freenetPackTransport.ts`; this file only
 * wires it to the two constructors.
 */

import { getDesktopBridge } from '../lib/desktopBridge.ts';
import { getFreenetHostCapability } from '../lib/freenetHostCapability.ts';
import { bridgeHasFreenetDataPath, createHostTransport } from './freenetHostTransport.ts';
import { selectFreenetTransportKind, type FreenetPackTransport } from './freenetPackTransport.ts';
import { createRelayTransport } from './freenetRelayTransport.ts';

let override: FreenetPackTransport | null = null;

export function getFreenetPackTransport(): FreenetPackTransport {
  if (override) return override;
  const bridge = getDesktopBridge()?.freenet;
  const hasDataPath = bridgeHasFreenetDataPath(bridge);
  const kind = selectFreenetTransportKind({
    capability: getFreenetHostCapability(),
    bridgeHasDataPath: hasDataPath,
  });
  return kind === 'host' && hasDataPath ? createHostTransport(bridge) : createRelayTransport();
}

/** Tests: pin a transport, or `null` to go back to the shell's own. */
export function setFreenetPackTransportForTests(transport: FreenetPackTransport | null): void {
  override = transport;
}
