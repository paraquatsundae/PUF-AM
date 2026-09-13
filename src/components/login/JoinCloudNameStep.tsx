import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { pinCodeHint } from '../../../shared/auth/byoPin.ts';
import type { LoginFlow } from '../../hooks/useLoginFlow';
import { BackLink, LoginBrand, LoginPanel } from './LoginBrand';

export function JoinCloudNameStep({ flow }: { flow: LoginFlow }) {
  const {
    join,
    displayName,
    setDisplayName,
    pin,
    handlePinSignIn,
    isSigningIn,
    error,
  } = flow;
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  return (
    <LoginPanel>
      <LoginBrand title="Your name" subtitle="Invite PIN — your name" />
      <p className="text-sm text-slate-600">
        Joining with an invite PIN. Type your name exactly as you will next time — the same name
        and PIN reopen your account.
      </p>

      {error ? (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      ) : null}

      <form className="space-y-4" onSubmit={handlePinSignIn}>
        <div className="space-y-2">
          <label htmlFor="join-display-name" className="text-sm font-medium text-slate-700">
            Your name
          </label>
          <input
            id="join-display-name"
            ref={nameRef}
            type="text"
            autoComplete="name"
            required
            minLength={2}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Name"
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center justify-between gap-2 text-sm">
          <p className="font-mono tracking-widest text-slate-700">{pinCodeHint(pin)}</p>
          <button
            type="button"
            onClick={() => join.changeCode()}
            className="text-sm font-medium text-emerald-700 hover:text-emerald-900"
          >
            Change
          </button>
        </div>

        <button
          type="submit"
          disabled={isSigningIn || displayName.trim().length < 2}
          className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-60 inline-flex justify-center items-center gap-2"
        >
          {isSigningIn ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
          Join farm
        </button>
      </form>

      <BackLink label="Back to Join a farm" onClick={() => join.back()} />
    </LoginPanel>
  );
}
