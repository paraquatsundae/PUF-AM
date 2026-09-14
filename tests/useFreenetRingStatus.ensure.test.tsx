/**
 * @vitest-environment jsdom
 *
 * Settings → Sync Freenet card must call ensure (start/attach) when shown.
 */

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setFreenetHostHoldOff } from '../src/lib/freenetHostHoldOff';
import { useFreenetRingStatus } from '../src/hooks/useFreenetRingStatus';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('pufam.farmStoreBackend', 'mist');
  localStorage.setItem('pufam.mist.session.v1', '{"v":1,"mode":"device","iv":"00","ct":"00"}');
  localStorage.setItem(
    'pufam.mist.sessionMeta.v1',
    JSON.stringify({ farmId: 'mist-1', farmName: 'Shed', displayName: 'G', hasDevicePin: false }),
  );
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('useFreenetRingStatus — Settings card ensure', () => {
  it('triggers ensure when the Freenet card is shown', async () => {
    const ensureHost = vi.fn(async () => undefined);
    renderHook(() =>
      useFreenetRingStatus('mist-1', {}, { readHost: async () => null, ensureHost, pollMs: 60_000 }),
    );
    expect(ensureHost).toHaveBeenCalled();
  });

  it('does not ensure while the kill-switch hold-off is on', async () => {
    setFreenetHostHoldOff(true);
    const ensureHost = vi.fn(async () => undefined);
    renderHook(() =>
      useFreenetRingStatus('mist-1', {}, { readHost: async () => null, ensureHost, pollMs: 60_000 }),
    );
    expect(ensureHost).not.toHaveBeenCalled();
  });

  it('does not ensure on a hosted-only cloud farm', async () => {
    localStorage.clear();
    const ensureHost = vi.fn(async () => undefined);
    renderHook(() =>
      useFreenetRingStatus('cloud-1', {}, { readHost: async () => null, ensureHost, pollMs: 60_000 }),
    );
    expect(ensureHost).not.toHaveBeenCalled();
  });
});
