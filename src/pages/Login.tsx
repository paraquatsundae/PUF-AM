import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, KeyRound } from 'lucide-react';

export function Login() {
  const { user, signInWithInvitePin, error: authError, loading } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [displayName, setDisplayName] = useState('');
  const navigate = useNavigate();

  const error = localError || authError;

  useEffect(() => {
    if (!loading && user && !authError) {
      navigate('/', { replace: true });
    }
  }, [user, authError, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Loading SentiNut...</p>
        </div>
      </div>
    );
  }

  const handlePinSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSigningIn(true);
    setLocalError(null);
    try {
      await signInWithInvitePin(pin, displayName);
    } catch (err: unknown) {
      console.error('Sign in error:', err);
      setLocalError(err instanceof Error ? err.message : 'Sign-in failed. Check your PIN and try again.');
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-xl">
        <div>
          <div className="mx-auto h-20 w-20 rounded-2xl flex items-center justify-center overflow-hidden shadow-sm">
            <img
              src="/logo.png"
              alt="SentiNut Logo"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">Welcome to SentiNut</h2>
          <p className="mt-2 text-center text-sm text-slate-600">
            Paddock-first walnut farm tools — map issues, diary plans, blight risk, and seasonal records.
          </p>
          <p className="mt-3 text-center text-xs text-slate-500">
            Enter the invite PIN from your farm manager
          </p>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form className="mt-8 space-y-4" onSubmit={handlePinSignIn}>
          <div className="space-y-2">
            <label htmlFor="displayName" className="text-sm font-medium text-slate-700">
              Your name
            </label>
            <input
              id="displayName"
              type="text"
              autoComplete="name"
              required
              minLength={2}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Alex"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[11px] text-slate-400">
              Use the same name next time to reopen your session with this PIN.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="pin" className="text-sm font-medium text-slate-700">
              Invite PIN
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                id="pin"
                type="text"
                autoComplete="one-time-code"
                required
                value={pin}
                onChange={(e) => setPin(e.target.value.toUpperCase())}
                placeholder="XXXXXXXX"
                spellCheck={false}
                className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSigningIn}
            className="w-full flex justify-center items-center py-3 px-4 text-sm font-medium rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-200"
          >
            {isSigningIn ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign in with invite PIN'
            )}
          </button>

          <p className="text-center text-xs text-slate-400">
            By signing in, you agree to our{' '}
            <button type="button" onClick={() => navigate('/terms')} className="text-emerald-600 hover:underline">
              Terms of Service
            </button>{' '}
            and{' '}
            <button type="button" onClick={() => navigate('/privacy')} className="text-emerald-600 hover:underline">
              Privacy Policy
            </button>
            .
          </p>
        </form>
      </div>
    </div>
  );
}
