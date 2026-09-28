/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  lastPublishedFreenetHandoff,
  saveFreenetBonesUri,
  saveFreenetHotUri,
  saveMistHotPublishStatus,
} from './mistHotPublishMeta.ts';

const FARM = 'handoff-farm-1';

describe('lastPublishedFreenetHandoff', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('needs both Hot and bones URIs', () => {
    expect(lastPublishedFreenetHandoff(FARM)).toBeNull();
    saveMistHotPublishStatus({
      farmId: FARM,
      publishedAt: '2026-09-19T00:00:00.000Z',
      contentHash: 'hot-hash',
      recordCount: 1,
      diaryCount: 0,
      issueCount: 0,
      issueArchiveCount: 0,
      encrypted: true,
      storageKey: 'hot',
    });
    saveFreenetHotUri(FARM, { freenetUri: 'FN02@hot', contentHash: 'hot-hash' });
    expect(lastPublishedFreenetHandoff(FARM)).toBeNull();
    saveFreenetBonesUri(FARM, { freenetUri: 'FN02@bones', contentHash: 'bones-hash' });
    expect(lastPublishedFreenetHandoff(FARM)).toEqual({
      hotUri: 'FN02@hot',
      bonesUri: 'FN02@bones',
      hotContentHash: 'hot-hash',
      bonesContentHash: 'bones-hash',
    });
  });
});
