/**
 * @vitest-environment jsdom
 *
 * Map-chrome Freenet copy must not mention the farm cloud.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §9
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { describeFreenetMapPending } from '../src/lib/freenetMapPending';
import { saveMistHotPublishStatus } from '../src/mist/mistHotPublishMeta';
import { saveMistPhotoIndexStatus } from '../src/mist/mistPhotoBridge';

function seedFreenetSession() {
  localStorage.setItem('pufam.farmStoreBackend', 'mist');
  localStorage.setItem('pufam.mist.session.v1', '{"v":1,"mode":"device","iv":"00","ct":"00"}');
  localStorage.setItem(
    'pufam.mist.sessionMeta.v1',
    JSON.stringify({ farmId: 'mist-1', farmName: 'Shed', displayName: 'G', hasDevicePin: false }),
  );
}

describe('describeFreenetMapPending', () => {
  beforeEach(() => localStorage.clear());

  it('is silent on a hosted cloud farm', () => {
    expect(describeFreenetMapPending('cloud-1')).toBeNull();
  });

  it('names an in-flight Freenet publish, never the cloud', () => {
    seedFreenetSession();
    saveMistHotPublishStatus({
      farmId: 'mist-1',
      publishedAt: '2026-09-13T00:00:00.000Z',
      contentHash: 'abc',
      recordCount: 1,
      diaryCount: 1,
      issueCount: 0,
      issueArchiveCount: 0,
      encrypted: true,
      storageKey: 'k',
      freenetPending: true,
    });
    const pending = describeFreenetMapPending('mist-1');
    expect(pending?.label).toMatch(/Freenet/i);
    expect(pending?.label).not.toMatch(/cloud/i);
    expect(pending?.title).not.toMatch(/cloud/i);
  });

  it('names an in-flight Freenet photo, never the cloud', () => {
    seedFreenetSession();
    saveMistHotPublishStatus({
      farmId: 'mist-1',
      publishedAt: '2026-09-14T00:00:00.000Z',
      contentHash: 'abc',
      recordCount: 1,
      diaryCount: 1,
      issueCount: 0,
      issueArchiveCount: 0,
      encrypted: true,
      storageKey: 'k',
      freenetUri: 'FN02@hot',
      freenetPending: false,
    });
    saveMistPhotoIndexStatus({ farmId: 'mist-1', pending: true, lastIssueId: 'i1' });
    const pending = describeFreenetMapPending('mist-1');
    expect(pending?.label).toMatch(/photo/i);
    expect(pending?.label).toMatch(/Freenet/i);
    expect(pending?.label).not.toMatch(/cloud/i);
    expect(pending?.title).not.toMatch(/cloud/i);
  });

  it('stays quiet once the farm is on Freenet', () => {
    seedFreenetSession();
    saveMistHotPublishStatus({
      farmId: 'mist-1',
      publishedAt: '2026-09-13T00:00:00.000Z',
      contentHash: 'abc',
      recordCount: 1,
      diaryCount: 1,
      issueCount: 0,
      issueArchiveCount: 0,
      encrypted: true,
      storageKey: 'k',
      freenetUri: 'FN02@hot',
      bonesFreenetUri: 'FN02@bones',
      freenetPending: false,
    });
    expect(describeFreenetMapPending('mist-1')).toBeNull();
  });
});
