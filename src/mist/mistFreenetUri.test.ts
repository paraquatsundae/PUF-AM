import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  getMistHotPublishStatus,
  saveFreenetHotUri,
  saveMistHotPublishStatus,
} from './mistHotPublishMeta.ts';

const FARM_ID = 'farm-two-fedora-01';

describe('saveFreenetHotUri', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storage.set(k, v);
      },
      removeItem: (k: string) => {
        storage.delete(k);
      },
    });
  });

  it('merges FN02 URI into publish status for laptop A handoff', () => {
    saveMistHotPublishStatus({
      farmId: FARM_ID,
      publishedAt: '2026-08-03T10:00:00.000Z',
      contentHash: 'abc123',
      recordCount: 3,
      diaryCount: 2,
      issueCount: 1,
      issueArchiveCount: 0,
      encrypted: true,
      storageKey: 'hot/current',
    });

    saveFreenetHotUri(FARM_ID, {
      freenetUri: 'FN02@GR5hs75vNK8A1peMoJAyVSRJ4Tspn2pgnYQeco8ptUdp',
      contentHash: 'abc123',
      freenetPending: false,
      storageKey: 'hot/current',
    });

    const status = getMistHotPublishStatus(FARM_ID);
    expect(status?.freenetUri).toBe('FN02@GR5hs75vNK8A1peMoJAyVSRJ4Tspn2pgnYQeco8ptUdp');
    expect(status?.freenetPublishedAt).toBeTruthy();
    expect(status?.recordCount).toBe(3);
  });
});

describe('normalizeMistFreenetUri (browser import path)', () => {
  it('re-exports from mist-freenet unit', async () => {
    const { normalizeMistFreenetUri } = await import('../../units/mist-freenet/src/freenet-uri-normalize.ts');
    expect(normalizeMistFreenetUri('FN02@abc123456789012345678901234567890')).toMatch(/^FN02@/);
  });
});
