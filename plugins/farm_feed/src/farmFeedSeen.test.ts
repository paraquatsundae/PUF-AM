import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  farmFeedLastSeenKey,
  readFarmFeedLastSeen,
  writeFarmFeedLastSeen,
} from './farmFeedSeen';

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
    },
  });
});

describe('farmFeedSeen', () => {
  afterEach(() => {
    memory.clear();
  });

  it('round-trips a local last-seen watermark (not Firestore)', () => {
    expect(farmFeedLastSeenKey('farm-a')).toBe('pufam.farmFeed.lastSeen.v1.farm-a');
    expect(readFarmFeedLastSeen('farm-a')).toBeNull();
    writeFarmFeedLastSeen('farm-a', '2026-09-15T08:00:00.000Z');
    expect(readFarmFeedLastSeen('farm-a')).toBe('2026-09-15T08:00:00.000Z');
  });
});
