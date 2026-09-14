/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { androidFreenetHostStatus } from './androidFreenetHost.ts';
import { isFreenetHostHoldOff } from './freenetHostHoldOff.ts';

const stopAllOurs = vi.fn();
const pluginAvailable = vi.fn(() => false);

vi.mock('./androidFreenetHost.ts', async () => {
  const actual = await vi.importActual<typeof import('./androidFreenetHost.ts')>(
    './androidFreenetHost.ts',
  );
  return {
    ...actual,
    androidFreenetHostStopAllOurs: () => stopAllOurs(),
    isFreenetHostPluginAvailable: () => pluginAvailable(),
  };
});

import { freenetKillSwitchCopy, stopFreenetOnThisDevice } from './stopFreenetOnDevice.ts';

afterEach(() => {
  stopAllOurs.mockReset();
  pluginAvailable.mockReset();
  pluginAvailable.mockReturnValue(false);
  delete window.pufamDesktop;
  sessionStorage.clear();
});

describe('stopFreenetOnThisDevice', () => {
  it('clears want (hold-off) and stops a managed desktop node', async () => {
    const desktopStop = vi.fn(async () => ({
      ...androidFreenetHostStatus({ mode: 'stopped', leftover: 'none' }),
      leftover: 'none' as const,
      portFree: true,
      stoppedOurs: true,
    }));
    window.pufamDesktop = {
      isDesktop: true,
      cloudApiBase: '',
      freenetApiBase: '',
      mistEnabled: true,
      platform: 'linux',
      freenet: {
        status: async () => null,
        start: async () => null,
        stop: async () => androidFreenetHostStatus(),
        stopAllOurs: desktopStop,
        onState: () => () => {},
      },
    };
    const after = await stopFreenetOnThisDevice();
    expect(isFreenetHostHoldOff()).toBe(true);
    expect(desktopStop).toHaveBeenCalledTimes(1);
    expect(after.leftover).toBe('none');
    expect(after.portFree).toBe(true);
    expect(stopAllOurs).not.toHaveBeenCalled();
  });

  it('does not silently claim Freenet Android Node was killed', async () => {
    pluginAvailable.mockReturnValue(true);
    stopAllOurs.mockResolvedValue({
      ...androidFreenetHostStatus({ mode: 'attached', reachable: true }),
      leftover: 'android-node',
      leftoverPackage: 'org.freenet.androidnode',
      portFree: false,
      stoppedOurs: true,
    });
    const after = await stopFreenetOnThisDevice();
    expect(isFreenetHostHoldOff()).toBe(true);
    expect(after.leftover).toBe('android-node');
    expect(after.portFree).toBe(false);
    expect(freenetKillSwitchCopy(after)).toMatch(/cannot force-stop/i);
    expect(freenetKillSwitchCopy(after)).not.toMatch(/we stopped Freenet Android Node/i);
  });
});
