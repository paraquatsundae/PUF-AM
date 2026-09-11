/**
 * `loginJoin` surface — FarmCode-first Freenet step.
 * Must not render `code` back. `Plans/LOGIN_JOIN_SINGLE_BOX.md` §2.4 J2-fn.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  FarmCodeError,
  parseFarmCode,
  type ParsedFarmCode,
} from '../../../units/mist-freenet/src/index.ts';
import { DEFAULT_JOIN_ROLE } from '../../../shared/sync/joinTicket.ts';
import { getLastDisplayName } from '../../../src/lib/deviceSession';
import { writeJoinTicketDraft } from '../../../src/lib/joinTicketDraft.ts';
import { finishMistFarmSetup } from '../../../src/mist/finishMistFarmSetup.ts';
import { BackLink, LoginBrand, LoginPanel } from '../../../src/components/login/LoginBrand';
import { DevicePinFields } from './DevicePinFields';
import { FarmCodeField } from './FarmCodeField';
import { prewarmFreenetHost } from './freenetLoginPrewarm.ts';

const DEFAULT_FARM_NAME = 'Recovered farm';

export default function FreenetLoginJoin({
  code,
  kind,
  heldTicket,
  onBack,
}: {
  code: string;
  kind: 'farm-code' | 'join-ticket';
  heldTicket?: string;
  availability: 'host' | 'reader';
  onBack: () => void;
}) {
  const [parsed, setParsed] = useState<ParsedFarmCode | null>(null);
  const [farmCodeInput, setFarmCodeInput] = useState('');
  const [farmName, setFarmName] = useState('');
  const [displayName, setDisplayName] = useState(() => getLastDisplayName());
  const [devicePin, setDevicePin] = useState('');
  const [skipPin, setSkipPin] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const ticket = heldTicket || (kind === 'join-ticket' ? code : '');

  useEffect(() => {
    void prewarmFreenetHost();
  }, []);

  useEffect(() => {
    if (kind !== 'farm-code' || !code) return;
    let cancelled = false;
    setBusy(true);
    void parseFarmCode(code)
      .then((result) => {
        if (!cancelled) {
          setParsed(result);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof FarmCodeError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Could not read that FarmCode',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, code]);

  useEffect(() => {
    if (parsed) nameRef.current?.focus();
  }, [parsed]);

  const acceptTyped = async () => {
    setBusy(true);
    setError(null);
    try {
      setParsed(await parseFarmCode(farmCodeInput));
    } catch (err) {
      setError(
        err instanceof FarmCodeError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not read that FarmCode',
      );
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    try {
      if (ticket) writeJoinTicketDraft(ticket);
      await finishMistFarmSetup({
        farmId: parsed.farmId,
        farmName: farmName.trim() || DEFAULT_FARM_NAME,
        displayName: displayName.trim(),
        farmSeed: parsed.farmSeed,
        skipPin,
        devicePin: skipPin ? undefined : devicePin,
        role: DEFAULT_JOIN_ROLE,
        joinTicketPending: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save mist session');
      setBusy(false);
    }
  };

  const needCode = !parsed && kind === 'join-ticket';

  return (
    <LoginPanel>
      <LoginBrand title="Freenet farm" subtitle="FarmCode first — then the join ticket." />

      {ticket ? (
        <p className="text-sm text-violet-800 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2">
          That is the join ticket — kept for the next step. The paper FarmCode comes first.
        </p>
      ) : null}

      {parsed ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
          <p className="font-semibold text-emerald-950">FarmCode accepted · farm id {parsed.farmId}</p>
        </div>
      ) : null}

      {error ? (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {error}
        </div>
      ) : null}

      {needCode ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void acceptTyped();
          }}
        >
          <FarmCodeField id="loginFarmCode" value={farmCodeInput} onChange={setFarmCodeInput} />
          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-xl bg-violet-700 text-white font-semibold disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Validate FarmCode'}
          </button>
        </form>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void finish();
          }}
        >
          <div className="space-y-2">
            <label htmlFor="join-fn-name" className="text-sm font-medium text-slate-700">
              Your name
            </label>
            <input
              id="join-fn-name"
              ref={nameRef}
              required
              minLength={2}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="join-fn-farm" className="text-sm font-medium text-slate-700">
              Farm name <span className="text-slate-400 font-normal">(optional, display only)</span>
            </label>
            <input
              id="join-fn-farm"
              value={farmName}
              onChange={(e) => setFarmName(e.target.value)}
              placeholder={DEFAULT_FARM_NAME}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl"
            />
          </div>
          <DevicePinFields
            optIn
            skipPin={skipPin}
            setSkipPin={setSkipPin}
            devicePin={devicePin}
            setDevicePin={setDevicePin}
          />
          <button
            type="submit"
            disabled={busy || !parsed || displayName.trim().length < 2 || (!skipPin && devicePin.length !== 4)}
            className="w-full py-3 rounded-xl bg-slate-900 text-white font-semibold disabled:opacity-50 inline-flex justify-center items-center gap-2"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            Continue to join ticket
          </button>
        </form>
      )}

      <BackLink label="Back" onClick={onBack} />
    </LoginPanel>
  );
}
