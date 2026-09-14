/**
 * @vitest-environment jsdom
 *
 * AppImage parity with the APK: start the bundled node (or attach) without
 * MIST_FREENET=1 and without pairing a LAN hub.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { setFreenetHostHoldOff } from '../src/lib/freenetHostHoldOff.ts';
import {
  ensureDesktopFreenetListening,
  ensureFreenetHostFromFarmSession,
  ensureFreenetHostFromSettingsCard,
  ensureFreenetHostListening,
  hostModeIsUp,
  startFreenetOnThisDevice,
} from '../src/mist/ensureFreenetHostListening.ts';
import type { FreenetHostStatus } from '../units/puf-freenet-host/src/types.ts';
import type { DesktopBridge } from '../src/lib/desktopBridge.ts';

function managed(): FreenetHostStatus {
  return {
    hostId: 'puf-freenet-host',
    mode: 'managed',
    reachable: true,
    wsUrl: 'ws://127.0.0.1:7509/v1/contract/command',
    wsHost: '127.0.0.1',
    wsPort: 7509,
    configDir: '',
    dataDir: '',
    logDir: '',
    updateRequired: false,
    binary: { path: '/tmp/freenet', source: 'bundled' },
  };
}

function attached(): FreenetHostStatus {
  return { ...managed(), mode: 'attached', binary: { path: 'loopback:7509', source: 'path' } };
}

function stopped(): FreenetHostStatus {
  return { ...managed(), mode: 'stopped', reachable: false, binary: undefined };
}

function fakeDesktop(opts: {
  prefOn?: boolean;
  start?: () => Promise<FreenetHostStatus | null>;
  status?: () => Promise<FreenetHostStatus | null>;
  setPreference?: (enabled: boolean) => Promise<{
    enabled: boolean;
    forcedByEnv: boolean;
    host: FreenetHostStatus | null;
  }>;
}): DesktopBridge {
  const start = opts.start ?? (async () => managed());
  const status = opts.status ?? (async () => stopped());
  const setPreference =
    opts.setPreference ??
    (async () => ({ enabled: true, forcedByEnv: false, host: managed() }));
  return {
    isDesktop: true,
    cloudApiBase: '',
    freenetApiBase: '',
    mistEnabled: opts.prefOn === true,
    platform: 'linux',
    mist: {
      getPreference: async () => ({ enabled: opts.prefOn === true, forcedByEnv: false }),
      setPreference,
    },
    freenet: {
      status,
      start,
      stop: async () => stopped(),
      onState: () => () => {},
    },
  };
}

afterEach(() => {
  delete window.pufamDesktop;
  sessionStorage.clear();
});

describe('hostModeIsUp', () => {
  it('counts managed, attached, and starting', () => {
    expect(hostModeIsUp(managed())).toBe(true);
    expect(hostModeIsUp(attached())).toBe(true);
    expect(hostModeIsUp({ ...managed(), mode: 'starting', reachable: false })).toBe(true);
    expect(hostModeIsUp(stopped())).toBe(false);
    expect(hostModeIsUp(null)).toBe(false);
  });
});

describe('ensureDesktopFreenetListening', () => {
  it('flips the mist preference and starts the bundled node — no MIST_FREENET required', async () => {
    const setPreference = vi.fn(async () => ({
      enabled: true,
      forcedByEnv: false,
      host: managed(),
    }));
    const start = vi.fn(async () => managed());
    const bridge = fakeDesktop({ prefOn: false, setPreference, start });
    const status = await ensureDesktopFreenetListening({ getBridge: () => bridge });
    expect(setPreference).toHaveBeenCalledWith(true);
    expect(start).not.toHaveBeenCalled();
    expect(status?.mode).toBe('managed');
  });

  it('attaches when :7509 is already up instead of spawning a second node', async () => {
    const start = vi.fn(async () => attached());
    const bridge = fakeDesktop({
      prefOn: true,
      status: async () => stopped(),
      start,
    });
    const status = await ensureDesktopFreenetListening({ getBridge: () => bridge });
    expect(status?.mode).toBe('attached');
    expect(start).toHaveBeenCalledOnce();
  });

  it('does not start again when the host is already managed', async () => {
    const start = vi.fn(async () => managed());
    const bridge = fakeDesktop({
      prefOn: true,
      status: async () => managed(),
      start,
    });
    const status = await ensureDesktopFreenetListening({ getBridge: () => bridge });
    expect(status?.mode).toBe('managed');
    expect(start).not.toHaveBeenCalled();
  });
});

describe('ensureFreenetHostListening', () => {
  it('uses the desktop bridge when this is the AppImage', async () => {
    const setPreference = vi.fn(async () => ({
      enabled: true,
      forcedByEnv: false,
      host: managed(),
    }));
    const bridge = fakeDesktop({ prefOn: false, setPreference });
    await ensureFreenetHostListening({ getBridge: () => bridge });
    expect(setPreference).toHaveBeenCalledWith(true);
  });

  it('is a no-op without a desktop bridge or Android plugin', async () => {
    await expect(ensureFreenetHostListening({ getBridge: () => null })).resolves.toBeUndefined();
  });
});

describe('ensureFreenetHostFromFarmSession', () => {
  it('starts when a Freenet farm session opens', async () => {
    const setPreference = vi.fn(async () => ({
      enabled: true,
      forcedByEnv: false,
      host: managed(),
    }));
    const bridge = fakeDesktop({ prefOn: false, setPreference });
    await ensureFreenetHostFromFarmSession(true, { getBridge: () => bridge });
    expect(setPreference).toHaveBeenCalledWith(true);
  });

  it('does not start when the open farm does not want a node', async () => {
    const setPreference = vi.fn(async () => ({
      enabled: true,
      forcedByEnv: false,
      host: managed(),
    }));
    const start = vi.fn(async () => managed());
    const bridge = fakeDesktop({ prefOn: false, setPreference, start });
    await ensureFreenetHostFromFarmSession(false, { getBridge: () => bridge });
    expect(setPreference).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });
});

describe('ensureFreenetHostFromSettingsCard', () => {
  it('triggers ensure when the Settings Freenet card is shown', async () => {
    const setPreference = vi.fn(async () => ({
      enabled: true,
      forcedByEnv: false,
      host: managed(),
    }));
    const bridge = fakeDesktop({ prefOn: false, setPreference });
    await ensureFreenetHostFromSettingsCard(true, { getBridge: () => bridge });
    expect(setPreference).toHaveBeenCalledWith(true);
  });

  it('does not start while the kill-switch hold-off is on', async () => {
    setFreenetHostHoldOff(true);
    const setPreference = vi.fn(async () => ({
      enabled: true,
      forcedByEnv: false,
      host: managed(),
    }));
    const start = vi.fn(async () => managed());
    const bridge = fakeDesktop({ prefOn: false, setPreference, start });
    await ensureFreenetHostFromSettingsCard(true, { getBridge: () => bridge });
    await ensureFreenetHostFromFarmSession(true, { getBridge: () => bridge });
    expect(setPreference).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it('Start Freenet clears hold-off and starts one node', async () => {
    setFreenetHostHoldOff(true);
    const setPreference = vi.fn(async () => ({
      enabled: true,
      forcedByEnv: false,
      host: managed(),
    }));
    const bridge = fakeDesktop({ prefOn: false, setPreference });
    await startFreenetOnThisDevice({ getBridge: () => bridge });
    expect(setPreference).toHaveBeenCalledWith(true);
  });

  it('does not start when the Settings Freenet card is hidden', async () => {
    const setPreference = vi.fn(async () => ({
      enabled: true,
      forcedByEnv: false,
      host: managed(),
    }));
    const start = vi.fn(async () => managed());
    const bridge = fakeDesktop({ prefOn: false, setPreference, start });
    await ensureFreenetHostFromSettingsCard(false, { getBridge: () => bridge });
    expect(setPreference).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });
});
