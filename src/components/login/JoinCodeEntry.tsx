import { LoginBrand, LoginPanel } from './LoginBrand';
import { joinCodeCanContinue, joinCodeLooksLine } from '../../lib/joinCodeClassifier.ts';
import type { LoginFlow } from '../../hooks/useLoginFlow';

export function JoinCodeEntry({ flow }: { flow: LoginFlow }) {
  const { join, freenetOption, freenetJoinAvailability, setStep, setMode, setLocalError } = flow;
  const line = join.notice || joinCodeLooksLine(join.classification, join.input);
  const canContinue = joinCodeCanContinue(join.classification);

  return (
    <LoginPanel>
      <LoginBrand
        title="Join a farm"
        subtitle="Type the code you were given. A PIN from the farm manager, or the paper FarmCode from the owner."
      />

      {join.heldTicket ? (
        <p
          className="text-sm text-violet-800 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2"
          role="status"
        >
          That is the join ticket — the paper FarmCode comes first
        </p>
      ) : null}

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (canContinue) join.continue();
        }}
      >
        <div className="space-y-1.5">
          <label htmlFor="join-code" className="text-sm font-medium text-slate-700">
            Code
          </label>
          <input
            id="join-code"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            value={join.input}
            onChange={(e) => join.setInput(e.target.value)}
            aria-describedby="join-code-status"
            className="w-full px-3 py-3 border border-slate-200 rounded-xl font-mono tracking-wider uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <p
            id="join-code-status"
            aria-live="polite"
            className="text-[12px] text-slate-500 min-h-[1.25rem]"
          >
            {line}
          </p>
        </div>

        <button
          type="submit"
          disabled={!canContinue}
          className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-50"
        >
          Continue
        </button>
      </form>

      <div className="flex flex-col items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            setMode('create');
            setLocalError(null);
            setStep(freenetOption === 'hidden' ? 'cloud-options' : 'create-choose');
          }}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Create a farm
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('join');
            setLocalError(null);
            setStep('firebase');
          }}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Other ways to sign in
        </button>
      </div>

      {freenetJoinAvailability !== 'none' ? (
        <p className="text-[11px] text-slate-400 text-center">
          Experimental Freenet farms use a FarmCode and a join ticket. Cloud farms use a PIN.
        </p>
      ) : null}
    </LoginPanel>
  );
}
