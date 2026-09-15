import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FARM_CHAT_COLLECTION,
  FARM_CHAT_DOC_ID,
  FARM_FEED_FIRESTORE_PATHS,
  farmChatDocPath,
  farmFeedSourceLooksUnbounded,
} from './farmFeedFirestore';

const SRC = join(__dirname);

describe('Farm feed hosted cost contract', () => {
  it('names only the capped farm_chat/log doc', () => {
    expect(FARM_FEED_FIRESTORE_PATHS).toEqual(['farms/{farmId}/farm_chat/log']);
    expect(farmChatDocPath('farm-a')).toBe('farms/farm-a/farm_chat/log');
    expect(FARM_CHAT_COLLECTION).toBe('farm_chat');
    expect(FARM_CHAT_DOC_ID).toBe('log');
  });

  it('flags an unbounded messages snapshot if one appeared', () => {
    expect(farmFeedSourceLooksUnbounded("onSnapshot(collection(db, 'messages'), cb)")).toBe(true);
    expect(farmFeedSourceLooksUnbounded('onSnapshot(query(collection(db, "farm_chat")), cb)')).toBe(
      true
    );
    expect(farmFeedSourceLooksUnbounded('const items = deriveFarmFeedItems(input)')).toBe(false);
    expect(
      farmFeedSourceLooksUnbounded("onSnapshot(doc(db, 'farms', farmId, 'farm_chat', 'log'), cb)")
    ).toBe(false);
  });

  it('pack source has no unbounded collection snapshot', () => {
    const files = readdirSync(SRC).filter(
      (name) => /\.(ts|tsx)$/.test(name) && !name.includes('.test.') && name !== 'farmFeedFirestore.ts'
    );
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      const source = readFileSync(join(SRC, name), 'utf8');
      expect(farmFeedSourceLooksUnbounded(source), name).toBe(false);
      expect(source).not.toMatch(/collection\([^)]*messages/);
    }
  });

  it('hosted helper only snapshots the single log doc', () => {
    const source = readFileSync(join(SRC, 'farmChatHosted.ts'), 'utf8');
    expect(source).toMatch(/onSnapshot/);
    expect(source).toMatch(/FARM_CHAT_COLLECTION/);
    expect(source).toMatch(/FARM_CHAT_DOC_ID/);
    expect(source).not.toMatch(/onSnapshot\s*\(\s*collection/);
    expect(source).not.toMatch(/getDocs\s*\(/);
  });
});
