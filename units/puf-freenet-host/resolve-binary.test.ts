import { describe, expect, it } from 'vitest';

import {
  FDEV_BINARY,
  FREENET_BINARY,
  freenetBinaryFileName,
  freenetOsTag,
  freenetPlatformTag,
  freenetVendorDir,
  resolveFreenetBinary,
  resolveFreenetBinaryOrThrow,
} from './src/resolve-binary.ts';
import { FreenetBinaryNotFoundError } from './src/errors.ts';

/** Treat only the listed absolute paths as present. */
function presence(...paths: string[]) {
  const set = new Set(paths);
  return (candidate: string) => set.has(candidate);
}

const linux = { platform: 'linux', arch: 'x64' } as const;

describe('freenetOsTag', () => {
  it('uses electron-builder ${os} naming so vendor/ matches extraResources', () => {
    expect(freenetOsTag('linux')).toBe('linux');
    expect(freenetOsTag('win32')).toBe('win');
    expect(freenetOsTag('darwin')).toBe('mac');
  });
});

describe('freenetBinaryFileName', () => {
  it('adds .exe on Windows only', () => {
    expect(freenetBinaryFileName(FREENET_BINARY, 'win32')).toBe('freenet.exe');
    expect(freenetBinaryFileName(FREENET_BINARY, 'linux')).toBe('freenet');
  });
});

describe('freenetPlatformTag', () => {
  it('keys the vendor dir and scripts/freenet-binaries.json the same way', () => {
    expect(freenetPlatformTag('linux', 'x64')).toBe('linux-x64');
    expect(freenetPlatformTag('win32', 'x64')).toBe('win-x64');
  });
});

describe('freenetVendorDir', () => {
  it('is where scripts/fetch-freenet-binaries.mjs writes', () => {
    expect(freenetVendorDir('/repo', 'linux', 'x64')).toBe('/repo/vendor/freenet/linux-x64');
  });

  it('uses win32 separators for a Windows target', () => {
    expect(freenetVendorDir('C:\\Projects\\am', 'win32', 'x64')).toBe(
      'C:\\Projects\\am\\vendor\\freenet\\win-x64',
    );
  });
});

describe('resolveFreenetBinary', () => {
  it('prefers the explicit option over env, bundled, vendor and PATH', () => {
    const result = resolveFreenetBinary(FREENET_BINARY, {
      ...linux,
      binaryPath: '/opt/explicit/freenet',
      searchPaths: ['/app/resources/freenet'],
      repoRoot: '/repo',
      env: { PATH: '/usr/bin', PUF_FREENET_BIN: '/opt/env/freenet' },
      isExecutable: presence(
        '/opt/explicit/freenet',
        '/opt/env/freenet',
        '/app/resources/freenet/freenet',
        '/usr/bin/freenet',
      ),
    });

    expect(result.binary).toEqual({ path: '/opt/explicit/freenet', source: 'option' });
  });

  it('falls back to the env override before the bundled resources dir', () => {
    const result = resolveFreenetBinary(FREENET_BINARY, {
      ...linux,
      searchPaths: ['/app/resources/freenet'],
      env: { PATH: '/usr/bin', PUF_FREENET_BIN: '/opt/env/freenet' },
      isExecutable: presence('/opt/env/freenet', '/app/resources/freenet/freenet'),
    });

    expect(result.binary).toEqual({ path: '/opt/env/freenet', source: 'env' });
  });

  it('prefers the bundled resources dir over vendor/ and PATH', () => {
    const result = resolveFreenetBinary(FREENET_BINARY, {
      ...linux,
      searchPaths: ['/app/resources/freenet'],
      repoRoot: '/repo',
      env: { PATH: '/home/op/.local/bin' },
      isExecutable: presence(
        '/app/resources/freenet/freenet',
        '/repo/vendor/freenet/linux-x64/freenet',
        '/home/op/.local/bin/freenet',
      ),
    });

    expect(result.binary).toEqual({ path: '/app/resources/freenet/freenet', source: 'bundled' });
  });

  it('finds the dev vendor build when nothing is bundled', () => {
    const result = resolveFreenetBinary(FREENET_BINARY, {
      ...linux,
      repoRoot: '/repo',
      env: { PATH: '' },
      isExecutable: presence('/repo/vendor/freenet/linux-x64/freenet'),
    });

    expect(result.binary).toEqual({
      path: '/repo/vendor/freenet/linux-x64/freenet',
      source: 'vendor',
    });
  });

  it('prefers a populated vendor/ over an installed ~/.local/bin/freenet', () => {
    // The Phase 2 acceptance check: `npm run desktop:vendor` must beat whatever the
    // developer happens to have installed, or the workshop tests the wrong binary.
    const result = resolveFreenetBinary(FREENET_BINARY, {
      ...linux,
      repoRoot: '/repo',
      env: { PATH: '/home/op/.local/bin:/usr/bin' },
      isExecutable: presence(
        '/repo/vendor/freenet/linux-x64/freenet',
        '/home/op/.local/bin/freenet',
      ),
    });

    expect(result.binary).toEqual({
      path: '/repo/vendor/freenet/linux-x64/freenet',
      source: 'vendor',
    });
  });

  it('resolves fdev out of the same vendor dir as freenet', () => {
    const result = resolveFreenetBinary(FDEV_BINARY, {
      ...linux,
      repoRoot: '/repo',
      env: { PATH: '/home/op/.local/bin' },
      isExecutable: presence('/repo/vendor/freenet/linux-x64/fdev', '/home/op/.local/bin/fdev'),
    });

    expect(result.binary).toEqual({ path: '/repo/vendor/freenet/linux-x64/fdev', source: 'vendor' });
  });

  it('finds bundled Windows binaries under the packaged resources dir', () => {
    const result = resolveFreenetBinary(FREENET_BINARY, {
      platform: 'win32',
      arch: 'x64',
      searchPaths: ['C:\\Program Files\\PUF-AM\\resources\\freenet'],
      repoRoot: 'C:\\Projects\\am',
      env: { PATH: 'C:\\Windows\\System32' },
      isExecutable: presence(
        'C:\\Program Files\\PUF-AM\\resources\\freenet\\freenet.exe',
        'C:\\Projects\\am\\vendor\\freenet\\win-x64\\freenet.exe',
      ),
    });

    expect(result.binary).toEqual({
      path: 'C:\\Program Files\\PUF-AM\\resources\\freenet\\freenet.exe',
      source: 'bundled',
    });
  });

  it('falls back to PATH (today: ~/.local/bin/freenet)', () => {
    const result = resolveFreenetBinary(FREENET_BINARY, {
      ...linux,
      env: { PATH: '/usr/bin:/home/op/.local/bin' },
      isExecutable: presence('/home/op/.local/bin/freenet'),
    });

    expect(result.binary).toEqual({ path: '/home/op/.local/bin/freenet', source: 'path' });
  });

  it('splits PATH with the target platform delimiter and appends .exe', () => {
    const result = resolveFreenetBinary(FDEV_BINARY, {
      platform: 'win32',
      arch: 'x64',
      env: { PATH: 'C:\\tools;C:\\freenet' },
      isExecutable: presence('C:\\freenet\\fdev.exe'),
    });

    expect(result.binary).toEqual({ path: 'C:\\freenet\\fdev.exe', source: 'path' });
  });

  it('reports the candidate trail when nothing resolves', () => {
    const result = resolveFreenetBinary(FREENET_BINARY, {
      ...linux,
      searchPaths: ['/app/resources/freenet'],
      env: { PATH: '/usr/bin' },
      isExecutable: () => false,
    });

    expect(result.binary).toBeNull();
    expect(result.searched).toEqual(['/app/resources/freenet/freenet', '/usr/bin/freenet']);
  });

  it('throws an actionable error from resolveFreenetBinaryOrThrow', () => {
    expect(() =>
      resolveFreenetBinaryOrThrow(FREENET_BINARY, {
        ...linux,
        env: { PATH: '/usr/bin' },
        isExecutable: () => false,
      }),
    ).toThrow(FreenetBinaryNotFoundError);
  });
});
