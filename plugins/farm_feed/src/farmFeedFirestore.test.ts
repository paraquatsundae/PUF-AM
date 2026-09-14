import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FARM_FEED_FIRESTORE_PATHS, farmFeedSourceLooksUnbounded } from './farmFeedFirestore';

const SRC = join(__dirname);

describe('Farm feed hosted cost contract', () => {
  it('adds zero new Firestore paths', () => {
    expect(FARM_FEED_FIRESTORE_PATHS).toEqual([]);
  });

  it('flags an unbounded messages snapshot if one appeared', () => {
    expect(farmFeedSourceLooksUnbounded("onSnapshot(collection(db, 'messages'), cb)")).toBe(true);
    expect(farmFeedSourceLooksUnbounded('const items = deriveFarmFeedItems(input)')).toBe(false);
  });

  it('pack source has no unbounded snapshot and no messages collection', () => {
    const files = readdirSync(SRC).filter(
      (name) =>
        /\.(ts|tsx)$/.test(name) &&
        !name.includes('.test.') &&
        name !== 'farmFeedFirestore.ts'
    );
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      const source = readFileSync(join(SRC, name), 'utf8');
      expect(farmFeedSourceLooksUnbounded(source), name).toBe(false);
      expect(source).not.toMatch(/firebase\/firestore/);
      expect(source).not.toMatch(/\bonSnapshot\b/);
      expect(source).not.toMatch(/collection\([^)]*messages/);
    }
  });
});
