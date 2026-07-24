import { describe, expect, it } from 'vitest';
import {
  isPufomBundleV1,
  mergeByLww,
  mergePufomBundles,
  PUFOM_FORMAT,
  PUFOM_VERSION,
  type PufomBundleV1,
} from '../shared/sync/pufomBundle';

function sample(farmId: string, overrides?: Partial<PufomBundleV1>): PufomBundleV1 {
  return {
    format: PUFOM_FORMAT,
    version: PUFOM_VERSION,
    farmId,
    exportedAt: '2026-07-24T00:00:00.000Z',
    geometry: {
      blocks: [{ id: 'b1', name: 'A', updatedAt: '2026-07-01T00:00:00.000Z' }],
      pins: [],
      tracks: [],
      viewport: null,
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
    issues: [{ id: 'i1', updatedAt: '2026-07-01T00:00:00.000Z', note: 'old' }],
    issuesArchive: [],
    diary: [{ id: 'd1', date: '2026-07-01', updatedAt: '2026-07-01T00:00:00.000Z' }],
    ...overrides,
  };
}

describe('pufomBundle', () => {
  it('validates v1 shape', () => {
    expect(isPufomBundleV1(sample('farm_1'))).toBe(true);
    expect(isPufomBundleV1({ format: 'pufom', version: 2 })).toBe(false);
  });

  it('LWW prefers newer stamp', () => {
    const merged = mergeByLww(
      [{ id: 'a', updatedAt: '2026-07-01T00:00:00.000Z', v: 1 }],
      [{ id: 'a', updatedAt: '2026-07-02T00:00:00.000Z', v: 2 }]
    );
    expect(merged[0]).toMatchObject({ v: 2 });
  });

  it('merges bundles without losing local-only entities', () => {
    const local = sample('farm_1', {
      issues: [
        { id: 'i1', updatedAt: '2026-07-01T00:00:00.000Z', note: 'old' },
        { id: 'i2', updatedAt: '2026-07-03T00:00:00.000Z', note: 'local-only' },
      ],
    });
    const incoming = sample('farm_1', {
      issues: [{ id: 'i1', updatedAt: '2026-07-05T00:00:00.000Z', note: 'newer' }],
      geometry: {
        blocks: [{ id: 'b1', name: 'A-renamed', updatedAt: '2026-07-10T00:00:00.000Z' }],
        pins: [{ id: 'p1', updatedAt: '2026-07-10T00:00:00.000Z' }],
        tracks: [],
        viewport: null,
        updatedAt: '2026-07-10T00:00:00.000Z',
      },
    });
    const out = mergePufomBundles(local, incoming);
    expect(out.issues.find((i) => i.id === 'i1')?.note).toBe('newer');
    expect(out.issues.find((i) => i.id === 'i2')?.note).toBe('local-only');
    expect(out.geometry.pins).toHaveLength(1);
    expect(out.geometry.blocks[0]?.name).toBe('A-renamed');
  });

  it('rejects cross-farm merge', () => {
    expect(() => mergePufomBundles(sample('a'), sample('b'))).toThrow(/different farms/);
  });
});
