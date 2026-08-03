import { describe, expect, it } from 'vitest';

import {
  DESKTOP_CONFIG_FLAG,
  decodeDesktopConfig,
  encodeDesktopConfig,
  type DesktopConfig,
} from './desktopConfig.ts';

const config: DesktopConfig = {
  isDesktop: true,
  cloudApiBase: 'https://am.pufworks.farm',
  freenetApiBase: '',
  mistEnabled: true,
};

describe('desktop config flag', () => {
  it('round-trips through the command line', () => {
    expect(decodeDesktopConfig([encodeDesktopConfig(config)])).toEqual(config);
  });

  it('survives the other arguments Electron adds', () => {
    const argv = ['/usr/bin/electron', '--enable-features=Foo', encodeDesktopConfig(config)];
    expect(decodeDesktopConfig(argv).cloudApiBase).toBe('https://am.pufworks.farm');
  });

  it('falls back to same-origin when the flag is absent', () => {
    // The safe direction: a local 404 beats sending farm data to an unintended host.
    expect(decodeDesktopConfig([])).toEqual({
      isDesktop: true,
      cloudApiBase: '',
      freenetApiBase: '',
      mistEnabled: false,
    });
  });

  it('falls back rather than throwing on a corrupt payload', () => {
    expect(decodeDesktopConfig([`${DESKTOP_CONFIG_FLAG}not-base64-json`]).isDesktop).toBe(true);
  });

  it('keeps isDesktop true even if the payload denies it', () => {
    const forged = `${DESKTOP_CONFIG_FLAG}${Buffer.from('{"isDesktop":false}').toString('base64')}`;
    expect(decodeDesktopConfig([forged]).isDesktop).toBe(true);
  });
});
