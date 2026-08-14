import { Building2, ChevronRight, Cloud, CreditCard } from 'lucide-react';
import { BackLink, LoginBrand, LoginPanel } from './LoginBrand';

export function CloudSyncOptions({
  onPufworks,
  onByo,
  onSubscribe,
  onBack,
  canGoWelcome,
}: {
  onPufworks: () => void;
  onByo: () => void;
  onSubscribe: () => void;
  onBack: () => void;
  canGoWelcome: boolean;
}) {
  return (
    <LoginPanel wide>
      <LoginBrand
        title="Cloud sync"
        subtitle="Three ways to put the farm on the internet. Read who pays before you continue."
      />

      <button
        type="button"
        onClick={onPufworks}
        className="w-full text-left rounded-2xl border-2 border-emerald-600 bg-emerald-50/50 p-4 hover:bg-emerald-50 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-emerald-600 text-white shrink-0">
            <Cloud className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900">PUFworks cloud</h3>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 rounded-full px-2 py-0.5">
                Invite only
              </span>
            </div>
            <p className="text-sm text-slate-600 mt-1">
              Join with an invite PIN, or create a farm with a one-use enrollment code from
              PUFworks. PUFworks pays Google for these farms.
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-emerald-700 shrink-0 mt-1" />
        </div>
      </button>

      <button
        type="button"
        onClick={onByo}
        className="w-full text-left rounded-2xl border-2 border-slate-300 bg-white p-4 hover:border-slate-500 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-slate-800 text-white shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-900">Your own Firebase</h3>
            <p className="text-sm text-slate-600 mt-1">
              For a tech-comfortable person. You create a Google project — no card unless you
              want cloud photos. Paste the config, publish the rules, Google bills you.
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-500 shrink-0 mt-1" />
        </div>
      </button>

      <button
        type="button"
        onClick={onSubscribe}
        className="w-full text-left rounded-2xl border-2 border-slate-300 bg-white p-4 hover:border-slate-500 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-slate-800 text-white shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-900">PUFworks subscription</h3>
            <p className="text-sm text-slate-600 mt-1">
              You pay PUFworks. They run the cloud for you. Not open yet — the next screen
              says what that will mean.
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-500 shrink-0 mt-1" />
        </div>
      </button>

      {canGoWelcome && <BackLink label="Back — including the free Freenet path" onClick={onBack} />}
    </LoginPanel>
  );
}
