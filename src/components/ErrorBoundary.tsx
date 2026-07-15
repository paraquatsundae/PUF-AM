import React, { useState } from 'react';
import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary';
import { clearFirestoreIndexedDb } from '../firebase';

function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  const [clearing, setClearing] = useState(false);
  let errorMessage = error.message;
  let isFirestoreError = false;
  const isInternalAssertion =
    errorMessage.includes('INTERNAL ASSERTION FAILED') || errorMessage.includes('"Pc"');

  try {
    const parsed = JSON.parse(error.message);
    if (parsed.operationType && parsed.error) {
      isFirestoreError = true;
      errorMessage = `Firestore Permission Error: You do not have permission to perform a '${parsed.operationType}' operation on the path '${parsed.path}'.\n\nDetails: ${parsed.error}`;
    }
  } catch {
    // Not a JSON error
  }

  const clearCacheAndReload = async () => {
    setClearing(true);
    try {
      await clearFirestoreIndexedDb();
    } finally {
      resetErrorBoundary();
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-red-600 mb-4">
          {isFirestoreError ? 'Access Denied' : 'Something went wrong'}
        </h2>
        {(isInternalAssertion || isFirestoreError) && (
          <p className="text-sm text-slate-600 mb-3">
            This is often a stale Firestore browser cache after a permission or auth glitch. Clear the
            local cache, then sign in again if prompted.
          </p>
        )}
        <div className="bg-red-50 text-red-800 p-4 rounded-lg overflow-auto max-h-64 text-sm font-mono mb-4 whitespace-pre-wrap">
          {errorMessage}
        </div>
        <div className="flex flex-col gap-2">
          {(isInternalAssertion || isFirestoreError) && (
            <button
              type="button"
              disabled={clearing}
              onClick={() => void clearCacheAndReload()}
              className="w-full bg-emerald-700 text-white py-2 px-4 rounded-lg hover:bg-emerald-800 transition-colors disabled:opacity-60"
            >
              {clearing ? 'Clearing…' : 'Clear Firestore cache & reload'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              resetErrorBoundary();
              window.location.reload();
            }}
            className="w-full bg-slate-900 text-white py-2 px-4 rounded-lg hover:bg-slate-800 transition-colors"
          >
            Reload Application
          </button>
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ReactErrorBoundary FallbackComponent={ErrorFallback}>
      {children}
    </ReactErrorBoundary>
  );
}
