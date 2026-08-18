import { useState } from 'react';
import { BackLink, LoginPanel } from './LoginBrand';

export function PufworksSubscribeExplain({
  onBack,
  onFreenet,
  onPufworks,
}: {
  onBack: () => void;
  onFreenet: () => void;
  onPufworks: () => void;
}) {
  const [agreed, setAgreed] = useState(false);

  return (
    <LoginPanel wide>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Cloud sync · PUFworks subscription
      </p>
      <h2 className="text-xl font-extrabold text-slate-900">You pay PUFworks, they run the cloud</h2>
      <p className="text-sm text-slate-600 leading-relaxed">
        This would be a hosted farm on PUFworks infrastructure. You would get invite PINs and
        the same farm on every device, without creating a Google project yourself.
      </p>
      <ul className="text-sm text-slate-600 space-y-2 list-disc pl-5">
        <li>Not open. There is no card to enter and no plan to pick today.</li>
        <li>
          When it opens, you will see the price and tick that you accept it{' '}
          <strong>before</strong> a farm is created.
        </li>
        <li>If a card fails, the farm would be suspended — that is a hosted service, not Freenet.</li>
      </ul>
      <p className="text-sm text-slate-600">
        Until then: <strong>Freenet is free</strong>, or join a PUFworks cloud farm if you have
        an invite PIN or enrollment code.
      </p>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
        />
        <span>I understand this is a paid hosted option and it is not available yet.</span>
      </label>
      <button
        type="button"
        disabled={!agreed}
        className="w-full py-3 rounded-xl bg-slate-900 text-white font-semibold disabled:opacity-40"
      >
        Not open yet
      </button>
      <button
        type="button"
        onClick={onPufworks}
        className="w-full py-2.5 rounded-xl border border-emerald-300 text-emerald-800 text-sm font-semibold hover:bg-emerald-50"
      >
        I have a PUFworks invite
      </button>
      <button
        type="button"
        onClick={onFreenet}
        className="w-full py-2.5 rounded-xl border border-violet-300 text-violet-800 text-sm font-semibold hover:bg-violet-50"
      >
        Use Freenet instead — free
      </button>
      <BackLink label="Back to cloud options" onClick={onBack} />
    </LoginPanel>
  );
}
