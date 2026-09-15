/**
 * @vitest-environment jsdom
 *
 * A farm-chat send must mark Hot pending so the 20 s watch tick can retry
 * if the first PUT succeeded and the next one was swallowed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/mist/mistDeviceSession.ts', () => ({
  hasMistDeviceSession: () => true,
  mistSessionCloudFarmId: () => null,
}));

vi.mock('../src/lib/freenetHostHoldOff.ts', () => ({
  isFreenetHostHoldOff: () => false,
}));

vi.mock('../src/mist/freenetPublishLock.ts', () => ({
  freenetFarmPublishInFlight: () => false,
}));

import { isHotPublishPending } from '../src/mist/mistHotPublishMeta';
import { scheduleMistHotAutoPublish } from '../src/mist/mistHotBridge';

const FARM_ID = 'hot-pending-farm-1';

describe('Hot pending on farm-chat schedule', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks pending immediately so a failed PUT can retry', () => {
    expect(isHotPublishPending(FARM_ID)).toBe(false);
    scheduleMistHotAutoPublish(FARM_ID);
    expect(isHotPublishPending(FARM_ID)).toBe(true);
  });
});
