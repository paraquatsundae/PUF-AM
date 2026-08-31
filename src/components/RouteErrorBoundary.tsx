import React, { Suspense } from 'react';
import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2, RefreshCw, WifiOff } from 'lucide-react';

/**
 * A chunk that would not load, as opposed to a page that threw.
 *
 * Every engine words this differently and none of them expose a code, so this
 * is a message match. A false negative only costs the operator the generic
 * wording; a false positive would tell them to check a connection that was
 * never the problem, so the patterns stay narrow.
 */
function isChunkLoadFailure(error: Error): boolean {
  const text = `${error.name}: ${error.message}`;
  return (
    /Failed to fetch dynamically imported module/i.test(text) ||
    /error loading dynamically imported module/i.test(text) ||
    /Importing a module script failed/i.test(text) ||
    /ChunkLoadError/i.test(text)
  );
}

function RouteErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  const navigate = useNavigate();

  // Anything that is not a missing chunk goes up to the app-level boundary,
  // which is where the Firestore recovery lives: a permission error or an
  // INTERNAL ASSERTION FAILED gets a "clear the local cache" button there, and
  // swallowing it here would replace real help with a shrug. Throwing from a
  // fallback propagates to the next boundary up rather than back into this one.
  if (!isChunkLoadFailure(error)) throw error;

  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-6 bg-amber-100">
          <WifiOff className="w-8 h-8 text-amber-600" />
        </div>

        <h2 className="text-xl font-bold text-slate-900 mb-2">
          This page did not finish downloading
        </h2>

        <p className="text-slate-600 mb-6">
          Each page is fetched the first time you open it, and this one could not be reached.
          Everything you have already opened still works offline. Try again once you are back in
          range.
        </p>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={resetErrorBoundary}
            className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 text-white py-3 px-4 rounded-xl font-medium hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
          <button
            type="button"
            onClick={() => {
              resetErrorBoundary();
              navigate('/');
            }}
            className="w-full bg-white text-slate-700 border border-slate-200 py-3 px-4 rounded-xl font-medium hover:bg-slate-50 transition-colors"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

function RouteFallback() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
        <p className="text-slate-500 font-medium">Loading...</p>
      </div>
    </div>
  );
}

/**
 * Catches an unreachable route chunk at the route, not at the root.
 *
 * The app-level `ErrorBoundary` sits above `AuthProvider` and the router, so
 * anything reaching it replaces the entire session with a reload prompt — and
 * a reload is itself a network round trip, which is no help to the tablet that
 * just failed to fetch a chunk. Resetting on `pathname` means navigating away
 * clears the error, so one unreachable page does not wedge the whole app.
 *
 * Deliberately narrow: every other kind of error is rethrown to the app-level
 * boundary, which knows how to offer the Firestore cache clear.
 *
 * The Suspense boundary is paired with it here rather than left in `App`
 * because the two have to nest in this order: a chunk that fails to load
 * rejects the very promise Suspense is waiting on, so the error boundary must
 * be the outer of the pair to see it.
 *
 * Must be rendered inside the router: it reads the current location.
 */
export function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <ReactErrorBoundary FallbackComponent={RouteErrorFallback} resetKeys={[pathname]}>
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </ReactErrorBoundary>
  );
}
