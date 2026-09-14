/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { androidAttachedStatus, androidFreenetHostStatus } from './androidFreenetHost.ts';

const stop = vi.fn(async () => androidFreenetHostStatus());
const statusNow = vi.fn(async () => androidAttachedStatus());
const pluginAvailable = vi.fn(() => false);

vi.mock('./androidFreenetHost.ts', async () => {
  const actual = await vi.importActual<typeof import('./androidFreenetHost.ts')>(
    './androidFreenetHost.ts',
  );
  return {
    ...actual,
    androidFreenetHostStop: () => stop(),
    androidFreenetHostStatusNow: () => statusNow(),
    isFreenetHostPluginAvailable: () => pluginAvailable(),
  };
});

import { stopManagedFreenetHost } from './stopManagedFreenet.ts';

afterEach(() => {
  stop.mockClear();
  statusNow.mockReset();
  pluginAvailable.mockReset();
  pluginAvailable.mockReturnValue(false);
  delete window.pufamDesktop;
});

describe('stopManagedFreenetHost', () => {
  it('calls desktop stop when the shell has a bridge', async () => {
    const desktopStop = vi.fn(async () => androidFreenetHostStatus({ mode: 'stopped' }));
    window.pufamDesktop = {
      isDesktop: true,
      cloudApiBase: '',
      freenetApiBase: '',
      mistEnabled: true,
      platform: 'linux',
      freenet: {
        status: async () => null,
        start: async () => null,
        stop: desktopStop,
        onState: () => () => {},
      },
    };
    const after = await stopManagedFreenetHost();
    expect(desktopStop).toHaveBeenCalledTimes(1);
    expect(after?.mode).toBe('stopped');
    expect(stop).not.toHaveBeenCalled();
  });

  it('does not stop an attached Android node', async () => {
    pluginAvailable.mockReturnValue(true);
    statusNow.mockResolvedValue(androidAttachedStatus());
    const after = await stopManagedFreenetHost();
    expect(stop).not.toHaveBeenCalled();
    expect(after?.mode).toBe('attached');
  });

  it('stops a managed Android :freenet', async () => {
    pluginAvailable.mockReturnValue(true);
    statusNow.mockResolvedValue(androidFreenetHostStatus({ mode: 'managed', reachable: true }));
    stop.mockResolvedValue(androidFreenetHostStatus());
    const after = await stopManagedFreenetHost();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(after?.mode).toBe('stopped');
  });
});
