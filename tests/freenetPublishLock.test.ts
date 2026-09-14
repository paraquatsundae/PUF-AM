import { afterEach, describe, expect, it } from 'vitest';

import { FREENET_PUT_ALREADY_IN_PROGRESS } from '../units/puf-freenet-host/src/put-ready.ts';
import {
  resetFreenetFarmPublishLockForTests,
  withFreenetFarmPublishLock,
} from '../src/mist/freenetPublishLock.ts';

afterEach(() => {
  resetFreenetFarmPublishLockForTests();
});

describe('withFreenetFarmPublishLock', () => {
  it('refuses a second farm Send while the first is running', async () => {
    let release!: () => void;
    const first = withFreenetFarmPublishLock(
      () =>
        new Promise<string>((resolve) => {
          release = () => resolve('one');
        }),
    );

    await expect(withFreenetFarmPublishLock(async () => 'two')).rejects.toThrow(
      FREENET_PUT_ALREADY_IN_PROGRESS,
    );

    release();
    await expect(first).resolves.toBe('one');
    await expect(withFreenetFarmPublishLock(async () => 'three')).resolves.toBe('three');
  });
});
