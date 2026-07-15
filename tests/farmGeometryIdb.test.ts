import { describe, expect, it } from 'vitest';
import { mergeGeometryById } from '../src/lib/farmGeometryIdb';

describe('mergeGeometryById', () => {
  it('prefers local entities when ids collide', () => {
    const remote = [
      { id: 'a', name: 'Remote A' },
      { id: 'b', name: 'Remote B' },
    ];
    const local = [{ id: 'a', name: 'Local A' }];
    const merged = mergeGeometryById(local, remote);
    expect(merged.find((x) => x.id === 'a')?.name).toBe('Local A');
    expect(merged.find((x) => x.id === 'b')?.name).toBe('Remote B');
    expect(merged).toHaveLength(2);
  });
});
