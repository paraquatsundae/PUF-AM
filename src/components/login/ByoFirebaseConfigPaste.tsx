import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  parseByoFirebaseConfig,
  type ByoFirebaseWebConfig,
} from '../../lib/byoFirebaseConfig';
import { probeByoFirebase } from '../../lib/byoFirebaseProbe';
import { BYO_FIREBASE_GUIDE_URL, FIREBASE_WEB_SETUP_URL } from '../../lib/byoDocs';
import { BackLink, LoginPanel } from './LoginBrand';
import { OutLink } from './OutLink';

export function ByoFirebaseConfigPaste({
  onValid,
  onBack,
}: {
  onValid: (config: ByoFirebaseWebConfig) => void;
  onBack: () => void;
}) {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleCheck = async () => {
    setError(null);
    setNote(null);
    const parsed = parseByoFirebaseConfig(raw);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (parsed.namedDatabaseDropped) {
      setNote(
        'A named Firestore database was in the paste. This app will use (default) so you keep the free daily allowance.'
      );
    }
    setBusy(true);
    try {
      const probe = await probeByoFirebase(parsed.config);
      if (!probe.ok) {
        setError(probe.error);
        return;
      }
      onValid(parsed.config);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach that project.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <LoginPanel wide>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Cloud sync · your own Firebase · 2 of 3
      </p>
      <h2 className="text-xl font-extrabold text-slate-900">Paste the web config</h2>
      <p className="text-sm text-slate-600">
        Firebase console → Project settings → Your apps → SDK setup and configuration →{' '}
        <strong>Config</strong>. Paste the JSON. The PUFworks project is refused here on purpose.{' '}
        <OutLink href={FIREBASE_WEB_SETUP_URL}>Google&apos;s screenshots</OutLink>
        {' · '}
        <OutLink href={BYO_FIREBASE_GUIDE_URL}>PUFworks walkthrough</OutLink>
      </p>
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        spellCheck={false}
        rows={10}
        placeholder={'{\n  "apiKey": "…",\n  "authDomain": "…",\n  "projectId": "…",\n  "appId": "…"\n}'}
        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      {note && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {note}
        </p>
      )}
      {error && (
        <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={busy || !raw.trim()}
        onClick={() => void handleCheck()}
        className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-900 text-white font-semibold disabled:opacity-40"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Check project and continue
      </button>
      <BackLink label="Back" onClick={onBack} />
    </LoginPanel>
  );
}
