import { KeyRound, Sprout } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { FreenetOptionState } from '../../../src/lib/loginStorageChoice.ts';
import { FreenetHowItWorksBody } from './FreenetHowItWorks';
import { BackLink, LoginPanel } from '../../../src/components/login/LoginBrand';
import { MIST_NEW_FARM_PATH, MIST_RECOVER_FARM_PATH } from './paths.ts';

/**
 * `loginExplain` surface (Plans/NETWORK_PACK_PLUGIN.md § index.ts): the pack
 * owns its two public routes, so it also owns the navigation to them.
 */
export default function FreenetExplainLoginStep({
  optionState,
  onBack,
}: {
  optionState: FreenetOptionState;
  onBack: () => void;
}) {
  const navigate = useNavigate();
  return (
    <FreenetExplain
      freenetOption={optionState}
      onStart={() => navigate(MIST_NEW_FARM_PATH)}
      onJoin={() => navigate(MIST_RECOVER_FARM_PATH)}
      onBack={onBack}
    />
  );
}

export function FreenetExplain({
  freenetOption,
  onStart,
  onJoin,
  onBack,
}: {
  freenetOption: FreenetOptionState;
  onStart: () => void;
  onJoin: () => void;
  onBack: () => void;
}) {
  const canStart = freenetOption === 'available';

  return (
    <LoginPanel wide>
      <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">
        Freenet network · completely free
      </p>
      <h2 className="text-xl font-extrabold text-slate-900">How this works</h2>
      <FreenetHowItWorksBody />

      {!canStart && (
        <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
          Freenet is switched off in this install. On a PUF-AM desktop, turn on Settings →{' '}
          <strong>Farm sync between laptops</strong>.
        </p>
      )}

      <button
        type="button"
        disabled={!canStart}
        onClick={onStart}
        className="w-full flex items-center gap-3 text-left rounded-2xl border-2 border-violet-400 p-4 hover:bg-violet-50 disabled:opacity-40 disabled:hover:bg-white"
      >
        <Sprout className="w-5 h-5 text-violet-700 shrink-0" />
        <span>
          <span className="block text-sm font-bold text-slate-900">Start a new farm</span>
          <span className="block text-sm text-slate-600">Shows a FarmCode once. You are the owner.</span>
        </span>
      </button>
      <button
        type="button"
        disabled={!canStart}
        onClick={onJoin}
        className="w-full flex items-center gap-3 text-left rounded-2xl border-2 border-violet-400 p-4 hover:bg-violet-50 disabled:opacity-40 disabled:hover:bg-white"
      >
        <KeyRound className="w-5 h-5 text-violet-700 shrink-0" />
        <span>
          <span className="block text-sm font-bold text-slate-900">Join a farm I already have</span>
          <span className="block text-sm text-slate-600">
            Type the paper FarmCode, then the owner&apos;s short join ticket.
          </span>
        </span>
      </button>
      <BackLink label="Back to welcome" onClick={onBack} />
    </LoginPanel>
  );
}
