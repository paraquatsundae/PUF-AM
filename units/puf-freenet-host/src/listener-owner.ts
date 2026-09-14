/**
 * Who holds the Freenet WS port — our child vs another AppImage vs a login node.
 *
 * Attach copy and `mode` depend on this. A user `freenet.service` on
 * `~/.local/bin/freenet` is not “an older AppImage”. Our own
 * `resources/freenet/freenet` must stay `managed`.
 * Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-14 (managed stays managed).
 */

import { readdirSync, readFileSync, readlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { FreenetAttachKind, FreenetListenerOwner } from './types.ts';

export type { FreenetAttachKind, FreenetListenerOwner };

export type FreenetListenerKind = 'ours' | FreenetAttachKind | 'unknown';

export type ClassifyFreenetListenerInput = {
  owner: FreenetListenerOwner | null;
  /** This bake’s resolved `resources/freenet/freenet` (or vendor/PATH). */
  bundledPath?: string;
  ourChildPid?: number;
  ourUid?: number;
  homeDir?: string;
  /** `--config-dir` we pass — PUF-AM data, not `~/.local/share/freenet`. */
  configDir?: string;
};

const APPIMAGE_FREENET = /\/tmp\/\.mount_PUF-AM[^/]*\/resources\/freenet\/freenet(?:\.exe)?$/i;
const BUNDLED_FREENET = /(?:^|\/)resources\/freenet\/freenet(?:\.exe)?$/i;
const LOCAL_BIN_FREENET = /\/\.local\/bin\/freenet(?:\.exe)?$/i;
const LOCAL_SHARE_FREENET = /\/\.local\/share\/freenet\/?$/i;
const LOCAL_STATE_FREENET = /\/\.local\/state\/freenet\/?$/i;
const PUFAM_FREENET_DIR = /[/\\]PUF-AM[/\\]freenet(?:[/\\]|$)/i;

function posixish(p: string): string {
  return p.replace(/\\/g, '/').replace(/\s+\(deleted\)$/i, '');
}

function samePath(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const left = posixish(path.resolve(a));
  const right = posixish(path.resolve(b));
  if (left === right) return true;
  try {
    return posixish(path.resolve(left)) === posixish(path.resolve(right));
  } catch {
    return false;
  }
}

function uidMatches(ownerUid: number | undefined, ourUid: number | undefined): boolean {
  if (ownerUid === undefined || ourUid === undefined) return true;
  return ownerUid === ourUid;
}

function looksLikeAppImageFreenet(exe: string): boolean {
  const p = posixish(exe);
  return APPIMAGE_FREENET.test(p) || BUNDLED_FREENET.test(p);
}

function looksLikeLoginLeftover(owner: FreenetListenerOwner, homeDir?: string): boolean {
  const exe = posixish(owner.exe ?? '');
  const cwd = posixish(owner.cwd ?? '');
  const home = homeDir ? posixish(homeDir) : '';

  if (exe && LOCAL_BIN_FREENET.test(exe)) return true;
  if (home && exe === `${home}/.local/bin/freenet`) return true;
  if (cwd && (LOCAL_SHARE_FREENET.test(cwd) || LOCAL_STATE_FREENET.test(cwd))) return true;
  if (home && (cwd === `${home}/.local/share/freenet` || cwd === `${home}/.local/state/freenet`)) {
    return true;
  }
  return false;
}

/**
 * Classify the port holder. `ours` must not become attached.
 */
export function classifyFreenetListener(input: ClassifyFreenetListenerInput): FreenetListenerKind {
  const owner = input.owner;
  if (!owner) return 'unknown';

  if (input.ourChildPid !== undefined && owner.pid === input.ourChildPid) return 'ours';
  if (!uidMatches(owner.uid, input.ourUid)) {
    if (looksLikeAppImageFreenet(owner.exe ?? '')) return 'other-appimage';
    return 'foreign';
  }

  const exe = owner.exe ? posixish(owner.exe) : '';
  // PATH can resolve to ~/.local/bin/freenet — that is a login leftover, not ours.
  if (looksLikeLoginLeftover(owner, input.homeDir)) return 'login-leftover';
  if (exe && input.bundledPath && samePath(exe, input.bundledPath)) return 'ours';

  const cmd = owner.cmdline ?? '';
  const cwd = owner.cwd ?? '';
  const usesOurDirs = Boolean(
    (input.configDir && (cmd.includes(input.configDir) || cwd.includes(input.configDir))) ||
      PUFAM_FREENET_DIR.test(cmd) ||
      PUFAM_FREENET_DIR.test(cwd),
  );

  if (exe && looksLikeAppImageFreenet(exe)) {
    if (input.bundledPath && !samePath(exe, input.bundledPath)) return 'other-appimage';
    if (input.bundledPath && samePath(exe, input.bundledPath)) return 'ours';
    return usesOurDirs ? 'ours' : 'other-appimage';
  }

  if (usesOurDirs && exe && input.bundledPath && samePath(exe, input.bundledPath)) return 'ours';
  if (usesOurDirs && !exe) return 'ours';
  return owner.pid !== undefined || exe ? 'foreign' : 'unknown';
}

export function attachKindFromListener(kind: FreenetListenerKind): FreenetAttachKind {
  if (kind === 'other-appimage' || kind === 'login-leftover') return kind;
  return 'foreign';
}

export function decidePortTakenMode(input: {
  listenerKind: FreenetListenerKind;
  hasChild: boolean;
  recordedManaged: boolean;
  attachIfRunning: boolean;
}): 'managed' | 'attached' | 'fail-no-attach' {
  if (input.hasChild || input.listenerKind === 'ours') return 'managed';
  // Probe flake: we already manage, inspect failed — do not flip to attached.
  if (input.recordedManaged && input.listenerKind === 'unknown') return 'managed';
  if (input.attachIfRunning) return 'attached';
  return 'fail-no-attach';
}

function parseHexPort(local: string | undefined): number | undefined {
  if (!local) return undefined;
  const hex = local.split(':').pop();
  if (!hex) return undefined;
  const port = Number.parseInt(hex, 16);
  return Number.isFinite(port) ? port : undefined;
}

function isLoopbackAddr(addr: string | undefined): boolean {
  if (!addr) return false;
  const upper = addr.toUpperCase();
  if (upper === '0100007F') return true; // 127.0.0.1
  if (upper === '00000000') return false;
  // ::1 as eight hex u32s, last word 01000000
  if (/^(?:0{8}){3}01000000$/i.test(upper)) return true;
  return false;
}

function inodesListeningOnPort(port: number): Set<number> {
  const inodes = new Set<number>();
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n').slice(1)) {
      const cols = line.trim().split(/\s+/);
      const local = cols[1];
      if (parseHexPort(local) !== port) continue;
      const addr = local?.split(':')[0];
      if (!isLoopbackAddr(addr) && file.endsWith('tcp')) continue;
      if (file.endsWith('tcp6') && !isLoopbackAddr(addr)) continue;
      const inode = Number(cols[9]);
      if (Number.isFinite(inode) && inode > 0) inodes.add(inode);
    }
  }
  return inodes;
}

function readOwner(pid: number): FreenetListenerOwner | null {
  try {
    const exe = posixish(readlinkSync(`/proc/${pid}/exe`));
    const cwd = posixish(readlinkSync(`/proc/${pid}/cwd`));
    const cmdline = readFileSync(`/proc/${pid}/cmdline`).toString('utf8').replace(/\0/g, ' ').trim();
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    const uidMatch = status.match(/^Uid:\s+(\d+)/m);
    return {
      pid,
      uid: uidMatch ? Number(uidMatch[1]) : undefined,
      exe,
      cwd,
      cmdline,
    };
  } catch {
    return null;
  }
}

/**
 * Linux `/proc` listen-owner. Returns `null` when `/proc` is missing or the
 * inode cannot be matched — callers then attach as `foreign`, not “ours”.
 */
export function inspectLoopbackListener(
  _host: string,
  port: number,
): FreenetListenerOwner | null {
  if (process.platform !== 'linux') return null;
  const inodes = inodesListeningOnPort(port);
  if (inodes.size === 0) return null;

  let pids: string[];
  try {
    pids = readdirSync('/proc').filter((name) => /^\d+$/.test(name));
  } catch {
    return null;
  }

  const ourUid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  for (const pidStr of pids) {
    let fds: string[];
    try {
      fds = readdirSync(`/proc/${pidStr}/fd`);
    } catch {
      continue;
    }
    for (const fd of fds) {
      let target: string;
      try {
        target = readlinkSync(`/proc/${pidStr}/fd/${fd}`);
      } catch {
        continue;
      }
      const match = /^socket:\[(\d+)\]$/.exec(target);
      if (!match) continue;
      if (!inodes.has(Number(match[1]))) continue;
      const owner = readOwner(Number(pidStr));
      if (!owner) continue;
      if (ourUid !== undefined && owner.uid !== undefined && owner.uid !== ourUid) continue;
      return owner;
    }
  }
  return null;
}

export function defaultHomeDir(): string | undefined {
  try {
    return os.homedir();
  } catch {
    return undefined;
  }
}
