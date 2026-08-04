/**
 * @vitest-environment jsdom
 *
 * The mist experimental gate has two independent inputs, and the difference
 * matters on the desktop shell: `VITE_MIST_EXPERIMENTAL` is inlined by Vite at
 * *build* time, so an operator launching a packaged app with `MIST_FREENET=1`
 * cannot switch it on. The preload bridge carries that launch flag at runtime,
 * which is what keeps the workshop UI reachable in the shell that owns the node.
 *
 * See `Plans/DESKTOP_FREENET_PLUGIN.md` §8.3.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DesktopBridge } from '../src/lib/desktopBridge.ts';
import { isMistExperimentalEnabled, setFarmStoreBackend } from '../src/mist/farmStoreBackend.ts';

function installBridge(overrides: Partial<DesktopBridge> = {}): void {
  window.pufamDesktop = {
    isDesktop: true,
    cloudApiBase: 'https://am.pufworks.farm',
    freenetApiBase: '',
    mistEnabled: true,
    platform: 'linux',
    freenet: {} as DesktopBridge['freenet'],
    ...overrides,
  };
}

afterEach(() => {
  delete window.pufamDesktop;
  localStorage.clear();
  vi.unstubAllEnvs();
});

describe('isMistExperimentalEnabled', () => {
  it('stays off for a plain web build on the default backend', () => {
    expect(isMistExperimentalEnabled()).toBe(false);
  });

  it('turns on when the build baked the Vite flag', () => {
    vi.stubEnv('VITE_MIST_EXPERIMENTAL', 'true');
    expect(isMistExperimentalEnabled()).toBe(true);
  });

  it('turns on when the desktop shell launched with mist enabled', () => {
    // `MIST_FREENET=1 ./PUF-AM.AppImage` — no Vite flag in the shipped bundle.
    installBridge({ mistEnabled: true });
    expect(isMistExperimentalEnabled()).toBe(true);
  });

  it('stays off on a Firebase-only desktop launch', () => {
    installBridge({ mistEnabled: false });
    expect(isMistExperimentalEnabled()).toBe(false);
  });

  it('ignores a forged bridge that does not claim to be the desktop shell', () => {
    installBridge({ isDesktop: false as unknown as true });
    expect(isMistExperimentalEnabled()).toBe(false);
  });

  it('turns on when the operator picked the mist backend', () => {
    setFarmStoreBackend('mist');
    expect(isMistExperimentalEnabled()).toBe(true);
  });
});
