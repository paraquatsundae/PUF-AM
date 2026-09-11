import { ChevronRight, Cloud, Network } from 'lucide-react';
import { APP_NAME } from '../../brand';
import type { FreenetOptionState } from '../../lib/loginStorageChoice.ts';
import { LoginBrand, LoginPanel } from './LoginBrand';

export function WelcomeChooser({
  freenetOption,
  onCloud,
  onFreenet,
  onBack,
}: {
  freenetOption: FreenetOptionState;
  onCloud: () => void;
  onFreenet: () => void;
  onBack?: () => void;
}) {
  const freenetOpen = freenetOption === 'available' || freenetOption === 'needs-setting';

  return (
    <LoginPanel wide>
      <LoginBrand title={`Welcome to ${APP_NAME}`} subtitle="Start a new farm — where will it live?" />

      <button
        type="button"
        onClick={onCloud}
        className="w-full text-left rounded-2xl border-2 border-emerald-600 bg-emerald-50/50 p-4 hover:bg-emerald-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-600 text-white shrink-0">
            <Cloud className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-900">Cloud sync</h3>
            <p className="text-sm text-slate-600 mt-0.5">
              Same farm on every device over the internet. Someone pays Google — next screen
              explains who.
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-emerald-700 shrink-0" />
        </div>
      </button>

      {freenetOpen ? (
        <button
          type="button"
          onClick={onFreenet}
          className="w-full text-left rounded-2xl border-2 border-violet-400 bg-white p-4 hover:border-violet-600 hover:bg-violet-50/40 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-700 text-white shrink-0">
              <Network className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900">Freenet network</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 rounded-full px-2 py-0.5">
                  Free
                </span>
              </div>
              <p className="text-sm text-slate-600 mt-0.5">
                Your devices, your paper FarmCode. No account and no bill.
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-violet-700 shrink-0" />
          </div>
        </button>
      ) : null}

      <p className="text-[11px] text-slate-400 text-center">
        A cloud farm can add a Freenet mirror later under Settings → Plugins.
      </p>
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="w-full inline-flex items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <span aria-hidden="true">←</span>
          Back to Join a farm
        </button>
      ) : null}
    </LoginPanel>
  );
}
