/**
 * Server-side singleton for the in-process Freenet peer (PUF-AM Express host).
 *
 * Hyphanet/Freenet node must still run locally on FCP port 9481 for live network.
 * This module is the FCP *client* hosted inside PUF-AM — not a separate daemon.
 */

import { join } from 'node:path';

import {
  createFreenetPeer,
  type FreenetPeer,
  type FreenetPeerStatus,
} from '../units/mist-freenet/src/node.ts';

let peer: FreenetPeer | null = null;
let peerRootDir: string | null = null;

export function isMistFreenetEnabled(): boolean {
  return process.env.MIST_FREENET === '1' || process.env.MIST_FREENET === 'true';
}

export function getMistFreenetRootDir(): string {
  return process.env.MIST_FREENET_ROOT?.trim() || join(process.cwd(), 'tmp', 'mist-freenet');
}

export function getFreenetPeerInstance(): FreenetPeer | null {
  return peer;
}

export function createFreenetPeerHost(options?: {
  rootDir?: string;
  contribute?: boolean;
  allowPlaintextForTests?: boolean;
}): FreenetPeer {
  const rootDir = options?.rootDir ?? getMistFreenetRootDir();
  peerRootDir = rootDir;
  peer = createFreenetPeer({
    rootDir,
    contribute: options?.contribute ?? false,
    allowPlaintextForTests: options?.allowPlaintextForTests ?? false,
  });
  return peer;
}

export async function ensureFreenetPeer(options?: {
  start?: boolean;
  contribute?: boolean;
}): Promise<FreenetPeer> {
  if (!peer) {
    createFreenetPeerHost({ contribute: options?.contribute });
  } else if (options?.contribute !== undefined) {
    peer.setContribute(options.contribute);
  }

  if (options?.start !== false && peer) {
    const status = await peer.status();
    if (!status.running) {
      await peer.start();
    }
  }

  return peer!;
}

export async function getFreenetPeerStatus(): Promise<FreenetPeerStatus> {
  if (!peer) {
    return {
      running: false,
      connected: false,
      contribute: false,
      backendId: 'freenet-peer',
      freenet: 'disconnected',
      rootDir: peerRootDir ?? getMistFreenetRootDir(),
    };
  }
  return peer.status();
}

export async function stopFreenetPeerHost(): Promise<FreenetPeerStatus> {
  if (!peer) {
    return getFreenetPeerStatus();
  }
  const status = await peer.stop();
  return status;
}

/** Called from server.ts when MIST_FREENET=1. */
export async function maybeAutoStartFreenetPeer(): Promise<void> {
  if (!isMistFreenetEnabled()) return;

  try {
    const status = await ensureFreenetPeer({ start: true });
    console.log(
      `[mist-freenet] peer auto-started — freenet=${status.freenet} root=${status.rootDir}`,
    );
    if (status.lastError) {
      console.warn(`[mist-freenet] connect note: ${status.lastError}`);
    }
  } catch (err) {
    console.warn('[mist-freenet] auto-start failed:', err);
  }
}

export async function shutdownFreenetPeerHost(): Promise<void> {
  if (!peer) return;
  try {
    await peer.stop();
  } catch {
    /* ignore */
  }
  peer = null;
}
