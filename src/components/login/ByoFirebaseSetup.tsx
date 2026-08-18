import {
  BYO_FIREBASE_GUIDE_URL,
  FIREBASE_FIRESTORE_QUICKSTART_URL,
  FIREBASE_PASSWORD_AUTH_URL,
  FIREBASE_WEB_SETUP_URL,
} from '../../lib/byoDocs';
import { BackLink, LoginPanel } from './LoginBrand';
import { OutLink } from './OutLink';

export function ByoFirebaseSetup({
  onContinue,
  onBack,
  onFreenet,
}: {
  onContinue: () => void;
  onBack: () => void;
  onFreenet: () => void;
}) {
  return (
    <LoginPanel wide>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Cloud sync · your own Firebase · 1 of 3
      </p>
      <h2 className="text-xl font-extrabold text-slate-900">Create the Google project</h2>
      <p className="text-sm text-slate-600 leading-relaxed">
        For a tech-comfortable person. Google&apos;s own pages have the current screenshots —
        we do not bake those into the app, they go stale. The PUF-AM extras (which buttons,
        Spark vs a card) live on pufworks.farm.
      </p>
      <p className="text-sm text-slate-600">
        <OutLink href={BYO_FIREBASE_GUIDE_URL}>PUFworks walkthrough</OutLink>
        {' · '}
        <OutLink href={FIREBASE_WEB_SETUP_URL}>Google: create a project and a web app</OutLink>
      </p>
      <ol className="text-sm text-slate-700 space-y-3 list-decimal pl-5">
        <li>
          Follow Google&apos;s setup to create a project and register a <strong>Web</strong> app.
          Stay on the no-cost <strong>Spark</strong> plan unless you need cloud photos. Skip
          Google Analytics.
        </li>
        <li>
          Authentication → Sign-in method → enable <strong>Email/Password</strong> (not email
          link).{' '}
          <OutLink href={FIREBASE_PASSWORD_AUTH_URL}>Google&apos;s auth page</OutLink>
        </li>
        <li>
          Firestore → create the database in <strong>(default)</strong>. A named second database
          loses the daily free allowance.{' '}
          <OutLink href={FIREBASE_FIRESTORE_QUICKSTART_URL}>Google&apos;s Firestore page</OutLink>
        </li>
        <li>
          Storage is optional. Start a bucket only if issue photos should live in the cloud —
          that step needs a billing account (Blaze), even at zero use. Diary and map work
          without it.
        </li>
        <li>Copy the web app config JSON. You paste it on the next screen.</li>
      </ol>
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 space-y-1">
        <p>
          <strong>Maps.</strong> This app will not use the PUFworks Google Maps key on your
          project — the map uses the offline Esri packs.
        </p>
        <p>
          <strong>Weather.</strong> Station cache still comes from the shared PUFworks endpoint
          (four documents, hourly). That is the one named exception.
        </p>
        <p>
          <strong>Page loads.</strong> Zero for PUFworks only on the desktop app or the
          sideloaded APK. A browser tab at am.pufworks.farm still loads the shell from PUFworks
          hosting.
        </p>
      </div>
      <button
        type="button"
        onClick={onContinue}
        className="w-full py-3 rounded-xl bg-slate-900 text-white font-semibold"
      >
        I have a web app config to paste
      </button>
      <button
        type="button"
        onClick={onFreenet}
        className="w-full py-2.5 rounded-xl border border-violet-300 text-violet-800 text-sm font-semibold hover:bg-violet-50"
      >
        Use Freenet instead — free
      </button>
      <BackLink label="Back" onClick={onBack} />
    </LoginPanel>
  );
}
