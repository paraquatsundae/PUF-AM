import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  assertAllowedFarmIdsReady,
  parseAllowedFarmIds,
} from '../scripts/firestoreAllowedFarms.mjs';

const repoRules = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8');

describe('firestoreAllowedFarms', () => {
  it('parses farmIds from allowedFarmIds()', () => {
    const src = `
      function allowedFarmIds() {
        return [
          'farm_aaa',
          "farm_bbb",
          // 'farm_commented',
        ];
      }
    `;
    expect(parseAllowedFarmIds(src)).toEqual(['farm_aaa', 'farm_bbb']);
  });

  it('dedupes repeated ids', () => {
    const src = `
      function allowedFarmIds() {
        return ['farm_aaa', 'farm_aaa'];
      }
    `;
    expect(parseAllowedFarmIds(src)).toEqual(['farm_aaa']);
  });

  it('throws when the helper is missing', () => {
    expect(() => parseAllowedFarmIds('match /farms/{farmId} {}')).toThrow(/missing allowedFarmIds/);
  });

  it('refuses an empty allowlist unless overridden', () => {
    const empty = `
      function allowedFarmIds() {
        return [
          // 'farm_xxxxxxxx',
        ];
      }
    `;
    expect(() => assertAllowedFarmIdsReady(empty)).toThrow(/empty/);
    expect(assertAllowedFarmIdsReady(empty, { allowEmpty: true })).toEqual([]);
  });

  it('accepts a populated allowlist', () => {
    const src = `
      function allowedFarmIds() {
        return ['farm_live'];
      }
    `;
    expect(assertAllowedFarmIdsReady(src)).toEqual(['farm_live']);
  });

  it('keeps allowedFarmIds() in the committed firestore.rules', () => {
    // Empty is OK in git — deploy refuses it until George fills real ids.
    expect(() => parseAllowedFarmIds(repoRules)).not.toThrow();
    expect(parseAllowedFarmIds(repoRules)).toEqual([]);
  });
});
