/**
 * `loginJoin` surface — crew invite or owner FarmCode recover.
 * Must not render `code` back. `Plans/LOGIN_JOIN_SINGLE_BOX.md` Decision — 2026-09-12.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  FarmCodeError,
  normalizeInviteToken,
  parseFarmCode,
  type ParsedFarmCode,
} from '../../../units/mist-freenet/src/index.ts';
import { getLastDisplayName } from '../../../src/lib/deviceSession';
import { finishMistFarmSetup } from '../../../src/mist/finishMistFarmSetup.ts';
import { joinFarmWithCrewInvite } from '../../../src/mist/crewInvite.ts';
import { BackLink, LoginBrand, LoginPanel } from '../../../src/components/login/LoginBrand';
import { useFreenetJoinWait } from '../../../src/hooks/useFreenetJoinWait.ts';
import { DevicePinFields } from './DevicePinFields';
import { FreenetJoinWaitPanel } from './FreenetJoinWaitPanel';
import { prewarmFreenetHost } from './freenetLoginPrewarm.ts';

const DEFAULT_FARM_NAME = 'Recovered farm';

export default function FreenetLoginJoin({
  code,
  kind,
  onBack,
}: {
  code: string;
  kind: 'farm-code' | 'join-ticket';
  heldTicket?: string;
  availability: 'host' | 'reader';
  onBack: () => void;
}) {
  const [parsed, setParsed] = useState<ParsedFarmCode | null>(null);
  const [farmName, setFarmName] = useState('');
  const [displayName, setDisplayName] = useState(() => getLastDisplayName());
  const [devicePin, setDevicePin] = useState('');
  const [skipPin, setSkipPin] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const invite = kind === 'join-ticket' ? normalizeInviteToken(code) : null;
  const joinWait = useFreenetJoinWait(true);

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
    if (parsed || invite) nameRef.current?.focus();
  }, [parsed, invite]);

  const finishOwnerRecover = async () => {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    try {
      await finishMistFarmSetup({
        farmId: parsed.farmId,
        farmName: farmName.trim() || DEFAULT_FARM_NAME,
        displayName: displayName.trim(),
        farmSeed: parsed.farmSeed,
        skipPin,
        devicePin: skipPin ? undefined : devicePin,
        role: 'owner',
        joinTicketPending: false,
        recovered: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save mist session');
      setBusy(false);
    }
  };

  const finishCrewJoin = async () => {
    if (!invite) return;
    setBusy(true);
    setError(null);
    try {
      const waited = await joinWait.waitUntilOpennet();
      if (!waited.ok) {
        setBusy(false);
        return;
      }
      await joinFarmWithCrewInvite({
        invite,
        farmName: farmName.trim() || 'Joined farm',
        displayName: displayName.trim(),
        skipPin,
        devicePin: skipPin ? undefined : devicePin,
      });
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join that farm');
      setBusy(false);
    }
  };

  if (kind === 'join-ticket' && !invite) {
    return (
      <LoginPanel>
        <LoginBrand title="Freenet farm" subtitle="Crew type only an invite — never a FarmCode." />
        <p className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          That short ticket cannot open the farm. Ask the owner for a crew invite (PUF- and 26
          letters).
        </p>
        <BackLink label="Back" onClick={onBack} />
      </LoginPanel>
    );
  }

  const title = invite ? 'Join with crew invite' : 'Recover this farm';
  const subtitle = invite
    ? 'This invite unwraps read keys — not the paper FarmCode.'
    : 'Owner recover. The FarmCode stays on this device.';

  return (
    <LoginPanel>
      <LoginBrand title={title} subtitle={subtitle} />

      {parsed ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
          <p className="font-semibold text-emerald-950">FarmCode accepted · farm id {parsed.farmId}</p>
        </div>
      ) : null}

      {invite ? (
        <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
          Crew invite accepted. Type your name — you do not need the paper FarmCode.
        </p>
      ) : null}

      <FreenetJoinWaitPanel wait={joinWait.view} />

      {error && joinWait.view.tone !== 'error' ? (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {error}
        </div>
      ) : null}

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (invite) void finishCrewJoin();
          else void finishOwnerRecover();
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
            placeholder={invite ? 'Joined farm' : DEFAULT_FARM_NAME}
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
          disabled={
            busy ||
            displayName.trim().length < 2 ||
            (!skipPin && devicePin.length !== 4) ||
            (!invite && !parsed)
          }
          className="w-full py-3 rounded-xl bg-slate-900 text-white font-semibold disabled:opacity-50 inline-flex justify-center items-center gap-2"
        >
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
          {invite && busy && joinWait.view.phase === 'connecting'
            ? 'Waiting for peers…'
            : invite
              ? 'Join this farm'
              : 'Open this farm'}
        </button>
      </form>

      <BackLink label="Back" onClick={onBack} />
    </LoginPanel>
  );
}
