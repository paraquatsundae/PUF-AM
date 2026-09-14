import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { APP_VERSION } from '../src/brand';
import { nextPatch, parseSemver } from '../scripts/bump-release.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('release version (Plans/NAMING.md §2)', () => {
  const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
    version: string;
    androidVersionCode: number;
  };

  it('keeps package.json version as x.y.z and a monotonic androidVersionCode', () => {
    expect(() => parseSemver(pkg.version)).not.toThrow();
    expect(pkg.androidVersionCode).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(pkg.androidVersionCode)).toBe(true);
  });

  it('bakes the same version into APP_VERSION', () => {
    expect(APP_VERSION).toBe(pkg.version);
  });

  it('reads Android versionName/versionCode from package.json, not hardcoded 1.0', () => {
    const gradle = readFileSync(path.join(REPO_ROOT, 'android/app/build.gradle'), 'utf8');
    expect(gradle).toMatch(/package\.json/);
    expect(gradle).toMatch(/androidVersionCode/);
    expect(gradle).not.toMatch(/versionName\s+"1\.0"/);
  });

  it('increments only the patch', () => {
    expect(nextPatch('0.0.1')).toBe('0.0.2');
    expect(nextPatch('0.1.0')).toBe('0.1.1');
  });
});
