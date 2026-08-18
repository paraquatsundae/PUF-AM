import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import firestoreRules from '../../../firestore.rules?raw';
import storageRules from '../../../storage.rules?raw';
import type { ByoFirebaseWebConfig } from '../../lib/byoFirebaseConfig';
import { persistByoFirebaseAndReload } from '../../lib/byoFirebaseConfig';
import { BYO_FIREBASE_GUIDE_URL, BYO_FIREBASE_RISKS_URL } from '../../lib/byoDocs';
import { BackLink, LoginPanel } from './LoginBrand';
import { OutLink } from './OutLink';

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="max-h-28 overflow-auto rounded-xl bg-slate-900 text-slate-100 text-[10px] leading-relaxed p-3">
        {text.slice(0, 400)}
        {text.length > 400 ? '\n…' : ''}
      </pre>
    </div>
  );
}

export function ByoFirebaseRules({
  config,
  onBack,
}: {
  config: ByoFirebaseWebConfig;
  onBack: () => void;
}) {
  const [deployed, setDeployed] = useState(false);

  return (
    <LoginPanel wide>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Cloud sync · your own Firebase · 3 of 3
      </p>
      <h2 className="text-xl font-extrabold text-slate-900">Deploy the rules</h2>
      <p className="text-sm text-slate-600 leading-relaxed">
        A new project starts locked. Paste these into the Firebase console or the farm cannot be
        created. This app cannot deploy them from the browser.{' '}
        <OutLink href={`${BYO_FIREBASE_GUIDE_URL}#rules`}>Where to paste them</OutLink>
        {' · '}
        <OutLink href={BYO_FIREBASE_RISKS_URL}>Why open rules are expensive</OutLink>
      </p>
      <ol className="text-sm text-slate-700 space-y-2 list-decimal pl-5">
        <li>
          Firestore → Rules → replace all → publish. Same file the PUFworks project uses, including
          join tickets so invite PINs work without a server.
        </li>
        <li>Storage → Rules → replace all → publish.</li>
        <li>
          Firestore → Indexes — if a query later asks for an index, tap the link in the error. The
          farm will still create without them.
        </li>
      </ol>
      <CopyBlock label="firestore.rules" text={firestoreRules} />
      <CopyBlock label="storage.rules" text={storageRules} />
      <p className="text-xs text-slate-500">
        Project <span className="font-mono text-slate-800">{config.projectId}</span> · database
        (default)
      </p>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={deployed}
          onChange={(e) => setDeployed(e.target.checked)}
          className="mt-1 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
        />
        <span>I have published the Firestore and Storage rules on this project.</span>
      </label>
      <button
        type="button"
        disabled={!deployed}
        onClick={() => persistByoFirebaseAndReload(config)}
        className="w-full py-3 rounded-xl bg-emerald-700 text-white font-semibold disabled:opacity-40"
      >
        Save this project and continue
      </button>
      <p className="text-[11px] text-slate-400 text-center">
        The app reloads against your project. Then create a farm or join with a farm ID + PIN.
      </p>
      <BackLink label="Back" onClick={onBack} />
    </LoginPanel>
  );
}
