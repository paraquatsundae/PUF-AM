import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * A dynamic import that survives one bad moment on the network.
 *
 * There is no service worker precaching these chunks, so a route's JavaScript
 * is fetched the first time somebody opens that page. On a tablet in a shed
 * that is exactly when the Wi-Fi drops out, and a single rejected `import()`
 * would otherwise take down the whole app — React has no way to retry a
 * `lazy()` that failed, and the error propagates to the nearest boundary.
 *
 * Re-running the import is safe: a module that threw while *evaluating* is
 * recorded as failed in the module registry and is not re-executed, so only a
 * genuine fetch failure gets another go.
 */

const RETRIES = 2;
const BASE_DELAY_MS = 400;
/** Long enough to cover walking back into range, short enough to still fail. */
const OFFLINE_WAIT_MS = 10_000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolves as soon as the browser reports a connection again, or when the cap
 * expires. `navigator.onLine` false is a reliable negative — retrying while it
 * holds is guaranteed to fail — so it is worth waiting on rather than burning
 * the retries.
 */
function whenOnline(): Promise<void> {
  if (typeof window === 'undefined' || navigator.onLine !== false) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener('online', done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, OFFLINE_WAIT_MS);
    window.addEventListener('online', done);
  });
}

export async function importWithRetry<T>(load: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try {
      return await load();
    } catch (error) {
      lastError = error;
      if (attempt === RETRIES) break;
      await whenOnline();
      await wait(BASE_DELAY_MS * 2 ** attempt);
    }
  }
  throw lastError;
}

/** `React.lazy`, with the retry above. Use this for every route and surface. */
export function lazyWithRetry<T extends ComponentType<never>>(
  load: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(() => importWithRetry(load));
}
