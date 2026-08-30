import { ArrowLeft } from 'lucide-react';
import { clearByoFirebaseAndReload } from '../../lib/byoFirebaseConfig';
import type { LoginFlow } from '../../hooks/useLoginFlow';
import { LoginBrand } from './LoginBrand';
import { LoginCreateFarmForm } from './LoginCreateFarmForm';
import { LoginJoinForm } from './LoginJoinForm';

type Props = {
  flow: LoginFlow;
};

export function LoginCloudForm({ flow }: Props) {
  const {
    mode,
    setMode,
    setLocalError,
    displayName,
    welcomeBack,
    byoActive,
    byoProject,
    setStep,
    error,
  } = flow;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-xl">
        <LoginBrand
          title={
            welcomeBack
              ? `Welcome back, ${displayName.split(' ')[0] || displayName}`
              : byoActive
                ? 'Your Firebase'
                : 'PUFworks cloud'
          }
          subtitle={
            welcomeBack
              ? 'Type the owner recovery PIN from when this farm was created — same name as before. A staff invite PIN works the same way.'
              : byoActive
                ? 'Create a farm on your project, or sign in with the farm ID and your recovery or invite PIN.'
                : 'Owners sign back in with the recovery PIN shown at create. Staff use an invite PIN. A new farm needs an enrollment code.'
          }
        />

        {byoActive && byoProject ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 space-y-1">
            <p>
              This device is using <span className="font-mono text-slate-900">{byoProject}</span>.
              Google bills that project.
            </p>
            <button
              type="button"
              onClick={() => clearByoFirebaseAndReload()}
              className="font-medium text-slate-700 underline underline-offset-2"
            >
              Disconnect and pick another option
            </button>
          </div>
        ) : null}

        {!welcomeBack && (
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setMode('join');
                setLocalError(null);
              }}
              className={`py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                mode === 'join' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Join a farm
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('create');
                setLocalError(null);
              }}
              className={`py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                mode === 'create' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Create a farm
            </button>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {mode === 'join' ? <LoginJoinForm flow={flow} /> : <LoginCreateFarmForm flow={flow} />}

        <button
          type="button"
          onClick={() => {
            setStep('cloud-options');
            setLocalError(null);
          }}
          className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 pt-2 border-t border-slate-100"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Other cloud options
        </button>
      </div>
    </div>
  );
}
