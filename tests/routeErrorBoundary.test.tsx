/**
 * @vitest-environment jsdom
 *
 * One unreachable page must cost a page, not the session.
 *
 * The app-level `ErrorBoundary` sits above `AuthProvider` and the router, so a
 * chunk that fails to load used to replace everything with "Something went
 * wrong" and a reload button — a reload being another network round trip, which
 * is no use to the tablet that just failed to fetch.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { lazy } from 'react';

import { RouteErrorBoundary } from '../src/components/RouteErrorBoundary.tsx';

afterEach(cleanup);

/** A route whose chunk never arrives, the way Vite words it. */
const DeadChunk = lazy(async () => {
  throw new Error('Failed to fetch dynamically imported module: /assets/Settings-abc.js');
});

function Shell({ path }: { path: string }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <div>
        <p>Farm shell</p>
        <RouteErrorBoundary>
          <Routes>
            <Route path="/settings" element={<DeadChunk />} />
            <Route path="/" element={<p>Dashboard</p>} />
          </Routes>
        </RouteErrorBoundary>
      </div>
    </MemoryRouter>
  );
}

describe('a route whose chunk will not load', () => {
  it('is reported as a download problem, not as a crash', async () => {
    render(<Shell path="/settings" />);

    expect(await screen.findByText(/did not finish downloading/i)).toBeTruthy();
    // The raw module URL is not something an operator in a shed can act on.
    expect(screen.queryByText(/Failed to fetch dynamically imported/i)).toBeNull();
  });

  it('leaves the rest of the app mounted', async () => {
    render(<Shell path="/settings" />);

    await screen.findByText(/did not finish downloading/i);
    expect(screen.getByText('Farm shell')).toBeTruthy();
  });

  it('offers a way out that is not a page reload', async () => {
    render(<Shell path="/settings" />);

    await screen.findByText(/did not finish downloading/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /back to dashboard/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /reload/i })).toBeNull();
  });

  it('hands anything that is not a missing chunk to the app-level boundary', async () => {
    // The root boundary is where the Firestore recovery lives — a permission
    // error or an INTERNAL ASSERTION FAILED gets a "clear the local cache"
    // button there. Catching those here would replace real help with a shrug.
    const Broken = lazy(async () => ({
      default: () => {
        throw new Error('Firestore permission denied');
      },
    }));

    render(
      <ReactErrorBoundary
        fallbackRender={({ error }) => <p>root saw: {(error as Error).message}</p>}
      >
        <MemoryRouter initialEntries={['/x']}>
          <RouteErrorBoundary>
            <Routes>
              <Route path="/x" element={<Broken />} />
            </Routes>
          </RouteErrorBoundary>
        </MemoryRouter>
      </ReactErrorBoundary>
    );

    expect(await screen.findByText(/root saw: Firestore permission denied/)).toBeTruthy();
    expect(screen.queryByText(/did not finish downloading/i)).toBeNull();
  });
});
