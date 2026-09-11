/**
 * @vitest-environment jsdom
 *
 * `farmPipes` — the three states a farm can be in on a device, read from the
 * stored backend preference and the (non-secret) mist session meta.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §1
 * @see Plans/FREENET_NETWORK_PACK.md §3
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  activeFarmPipe,
  activeFarmPipes,
  farmPipeLabel,
  freenetPlaneFarmId,
  hasFreenetPlane,
  isCloudMirror,
  isFarmCodeSession,
  isHybridFarm,
  mirroredCloudFarmId,
  showFreenetFarmTools,
} from '../src/lib/farmPipes';

function seedSession(meta: Record<string, unknown>, backend: 'firebase' | 'mist') {
  localStorage.setItem('pufam.farmStoreBackend', backend);
  localStorage.setItem('pufam.mist.session.v1', '{"v":1,"mode":"device","iv":"00","ct":"00"}');
  localStorage.setItem('pufam.mist.sessionMeta.v1', JSON.stringify(meta));
}

beforeEach(() => localStorage.clear());

describe('cloud — no seed on the device', () => {
  it('is the default', () => {
    expect(activeFarmPipe()).toBe('cloud');
    expect(activeFarmPipes()).toEqual({ lan: true, cloud: true, freenet: false, files: true, cloudMirror: false });
    expect(hasFreenetPlane()).toBe(false);
    expect(isCloudMirror()).toBe(false);
    expect(isFarmCodeSession()).toBe(false);
    expect(freenetPlaneFarmId()).toBeNull();
    // `showFreenetFarmTools()` also answers true on a bench (workshop
    // diagnostics), which is what a vitest run is — so only the pipe is asserted here.
  });
});

describe('freenet — a Freenet-native farm is the login', () => {
  beforeEach(() => seedSession({ farmId: 'mist-1', farmName: 'Shed', displayName: 'G', hasDevicePin: false }, 'mist'));

  it('reports freenet with no cloud pipe', () => {
    expect(activeFarmPipe()).toBe('freenet');
    expect(activeFarmPipes()).toMatchObject({ cloud: false, freenet: true, cloudMirror: false });
    expect(isFarmCodeSession()).toBe(true);
    expect(isCloudMirror()).toBe(false);
    expect(mirroredCloudFarmId()).toBeNull();
    expect(freenetPlaneFarmId()).toBe('mist-1');
    expect(farmPipeLabel()).toBe('Freenet');
  });
});

describe('hybrid — member device (cloud login + sealed seed for that farm)', () => {
  beforeEach(() =>
    seedSession(
      { farmId: 'mist-1', farmName: 'Shed', displayName: 'G', hasDevicePin: false, cloudFarmId: 'cloud-1' },
      'firebase',
    ),
  );

  it('is hybrid with both pipes and no mirror', () => {
    expect(activeFarmPipe()).toBe('hybrid');
    expect(activeFarmPipe('cloud-1')).toBe('hybrid');
    expect(isHybridFarm('cloud-1')).toBe(true);
    expect(activeFarmPipes('cloud-1')).toEqual({ lan: true, cloud: true, freenet: true, files: true, cloudMirror: false });
    expect(isCloudMirror()).toBe(false);
    expect(isFarmCodeSession()).toBe(false);
    expect(mirroredCloudFarmId()).toBe('cloud-1');
    expect(freenetPlaneFarmId()).toBe('mist-1');
    expect(showFreenetFarmTools('cloud-1')).toBe(true);
    expect(farmPipeLabel()).toBe('Cloud sync + Freenet mirror');
  });

  it('a seed for a different cloud farm makes the open farm plain cloud', () => {
    expect(activeFarmPipe('cloud-2')).toBe('cloud');
    expect(activeFarmPipes('cloud-2')).toMatchObject({ cloud: true, freenet: false, cloudMirror: false });
    expect(hasFreenetPlane('cloud-2')).toBe(false);
  });
});

describe('hybrid — mirror device (joined a cloud farm over Freenet)', () => {
  beforeEach(() =>
    seedSession(
      { farmId: 'mist-1', farmName: 'Shed', displayName: 'G', hasDevicePin: false, cloudFarmId: 'cloud-1', joinedViaTicket: true },
      'mist',
    ),
  );

  it('is hybrid, read-only, with the Freenet pipe only', () => {
    expect(activeFarmPipe()).toBe('hybrid');
    expect(isCloudMirror()).toBe(true);
    expect(isFarmCodeSession()).toBe(true);
    expect(activeFarmPipes()).toEqual({ lan: true, cloud: false, freenet: true, files: true, cloudMirror: true });
    expect(hasFreenetPlane()).toBe(true);
    expect(mirroredCloudFarmId()).toBe('cloud-1');
  });

  it('ignores the cloud-farm hint — the mist session is the login', () => {
    expect(activeFarmPipe('cloud-9')).toBe('hybrid');
  });
});
