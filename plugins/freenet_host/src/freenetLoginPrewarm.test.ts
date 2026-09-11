import { describe, expect, it, vi } from 'vitest';

import type { DesktopBridge } from '../../../src/lib/desktopBridge.ts';
import { createFreenetHostReconciler } from './freenetHostReconcile.ts';
import { prewarmFreenetHost } from './freenetLoginPrewarm.ts';

function fakeBridge(prefOn: boolean) {
  const setPreference = vi.fn(async (enabled: boolean) => ({
    enabled,
    forcedByEnv: false,
    host: null,
  }));
  const start = vi.fn(async () => ({ mode: 'managed' as const }));
  const status = vi.fn(async () => null);
  const peerStart = vi.fn(async () => ({}));
  const bridge = {
    isDesktop: true as const,
    cloudApiBase: '',
    freenetApiBase: '',
    mistEnabled: prefOn,
    platform: 'test',
    mist: {
      getPreference: async () => ({ enabled: prefOn, forcedByEnv: false }),
      setPreference,
    },
    freenet: {
      status,
      start,
      stop: async () => null,
      onState: () => () => {},
    },
  } as unknown as DesktopBridge;
  return { bridge, setPreference, start, peerStart };
}

describe('prewarmFreenetHost', () => {
  it('flips the preference when it is off and reconciles once', async () => {
    const { bridge, setPreference, start, peerStart } = fakeBridge(false);
    await prewarmFreenetHost({
      getCapability: () => 'electron',
      getBridge: () => bridge,
      createReconciler: (b) =>
        createFreenetHostReconciler({
          host: b.freenet,
          peer: { start: peerStart, stop: async () => {} },
        }),
    });
    expect(setPreference).toHaveBeenCalledWith(true);
    expect(start).toHaveBeenCalledTimes(1);
    expect(peerStart).toHaveBeenCalledTimes(1);
  });

  it('does not flip the preference when it is already on', async () => {
    const { bridge, setPreference, start } = fakeBridge(true);
    await prewarmFreenetHost({
      getCapability: () => 'electron',
      getBridge: () => bridge,
      createReconciler: (b) =>
        createFreenetHostReconciler({
          host: b.freenet,
          peer: { start: async () => {}, stop: async () => {} },
        }),
    });
    expect(setPreference).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when there is no host capability', async () => {
    const getBridge = vi.fn();
    await prewarmFreenetHost({
      getCapability: () => null,
      getBridge,
    });
    expect(getBridge).not.toHaveBeenCalled();
  });
});
