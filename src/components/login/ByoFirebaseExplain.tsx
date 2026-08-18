import { useState } from 'react';
import {
  BYO_FIREBASE_GUIDE_URL,
  BYO_FIREBASE_RISKS_URL,
  FIREBASE_PRICING_URL,
} from '../../lib/byoDocs';
import { BackLink, LoginPanel } from './LoginBrand';
import { OutLink } from './OutLink';

export function ByoFirebaseExplain({
  onBack,
  onFreenet,
  onContinue,
}: {
  onBack: () => void;
  onFreenet: () => void;
  onContinue: () => void;
}) {
  const [agreed, setAgreed] = useState(false);

  return (
    <LoginPanel wide>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Cloud sync · your own Firebase
      </p>
      <h2 className="text-xl font-extrabold text-slate-900">You pay Google, not PUFworks</h2>
      <p className="text-sm text-slate-600 leading-relaxed">
        This path is for a <strong>tech-comfortable person</strong> — someone who can open
        Google&apos;s console, create a project, and paste a config. If that is not you, use{' '}
        <strong>Freenet</strong> (free) or a PUFworks invite.
      </p>
      <p className="text-sm text-slate-600 leading-relaxed">
        PUF-Ag Manager stores the diary, map, issues and photos in a Firebase project{' '}
        <strong>you</strong> create and <strong>you</strong> own. PUFworks never sees that data
        and never pays for it.
      </p>
      <ul className="text-sm text-slate-600 space-y-2 list-disc pl-5">
        <li>
          Start on Google&apos;s <strong>Spark</strong> plan — no card. Auth and Firestore have a
          daily free allowance. A quiet farm often stays at $0.
        </li>
        <li>
          A card (Blaze) is only required if you want <strong>cloud photos</strong> — Storage
          needs billing even at zero use — or if you blow the daily Firestore allowance.
        </li>
        <li>
          Live crew dots and lots of photos are what run the bill up. A stuck device or an open
          rule can keep writing. Set a budget alert before harvest.
        </li>
      </ul>
      <p className="text-sm text-slate-600">
        <OutLink href={BYO_FIREBASE_GUIDE_URL}>PUFworks walkthrough</OutLink>
        {' · '}
        <OutLink href={BYO_FIREBASE_RISKS_URL}>Cost runaway and data security</OutLink>
        {' · '}
        <OutLink href={FIREBASE_PRICING_URL}>Google&apos;s prices</OutLink>
      </p>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
        />
        <span>
          I understand I am connecting my own Firebase project, I am responsible for its billing,
          and I have read the cost and security notes.
        </span>
      </label>
      <button
        type="button"
        disabled={!agreed}
        onClick={onContinue}
        className="w-full py-3 rounded-xl bg-slate-900 text-white font-semibold disabled:opacity-40"
      >
        I understand — continue
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
