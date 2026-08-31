/**
 * @vitest-environment jsdom
 *
 * A route's JavaScript is fetched the first time somebody opens that page.
 * There is no service worker precaching it, so on a tablet in a shed that is
 * exactly the moment the Wi-Fi drops — and React cannot retry a `lazy()` that
 * rejected, so one bad fetch took the whole app to the error screen.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { importWithRetry } from '../src/lib/lazyWithRetry.ts';

/** Pretend the browser is offline, as `whenOnline` reads it. */
function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

beforeEach(() => {
  vi.useFakeTimers();
  setOnline(true);
});

afterEach(() => {
  vi.useRealTimers();
  setOnline(true);
});

describe('importWithRetry', () => {
  it('does not retry an import that worked', async () => {
    const load = vi.fn(async () => 'module');
    await expect(importWithRetry(load)).resolves.toBe('module');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('recovers when the second attempt succeeds', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockResolvedValueOnce('module');

    const settled = importWithRetry(load);
    await vi.runAllTimersAsync();

    await expect(settled).resolves.toBe('module');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('gives up after three attempts and rethrows the last failure', async () => {
    const boom = new Error('Failed to fetch dynamically imported module');
    const load = vi.fn<() => Promise<string>>().mockRejectedValue(boom);

    const settled = importWithRetry(load);
    // Attached before the timers run, so the rejection is never unhandled.
    const assertion = expect(settled).rejects.toBe(boom);
    await vi.runAllTimersAsync();
    await assertion;

    expect(load).toHaveBeenCalledTimes(3);
  });

  it('waits for the connection back rather than spending a retry offline', async () => {
    setOnline(false);
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockResolvedValueOnce('module');

    const settled = importWithRetry(load);
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);

    // Still parked five seconds later: retrying while offline is a wasted try.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(load).toHaveBeenCalledTimes(1);

    setOnline(true);
    window.dispatchEvent(new Event('online'));
    await vi.runAllTimersAsync();

    await expect(settled).resolves.toBe('module');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('still gives up if the connection never comes back', async () => {
    setOnline(false);
    const boom = new Error('Failed to fetch dynamically imported module');
    const load = vi.fn<() => Promise<string>>().mockRejectedValue(boom);

    const settled = importWithRetry(load);
    const assertion = expect(settled).rejects.toBe(boom);
    await vi.runAllTimersAsync();
    await assertion;

    expect(load).toHaveBeenCalledTimes(3);
  });
});
