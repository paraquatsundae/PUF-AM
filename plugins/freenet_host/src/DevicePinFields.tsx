/**
 * Optional 4-digit device PIN. Skip-by-default (hybrid mint) or opt-in (login join).
 */
export function DevicePinFields(props: {
  skipPin: boolean;
  setSkipPin: (v: boolean) => void;
  devicePin: string;
  setDevicePin: (v: string) => void;
  /** When true, the checkbox is "Set a PIN" instead of "Skip the PIN". */
  optIn?: boolean;
}) {
  const setPin = (raw: string) => props.setDevicePin(raw.replace(/\D/g, '').slice(0, 4));

  if (props.optIn) {
    return (
      <div className="space-y-2">
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={!props.skipPin}
            onChange={(e) => props.setSkipPin(!e.target.checked)}
          />
          <span>Set a 4-digit PIN for this device</span>
        </label>
        {!props.skipPin && (
          <input
            type="password"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            aria-label="4-digit device PIN"
            placeholder="4-digit device PIN"
            value={props.devicePin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-mono tracking-widest"
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="flex items-start gap-2 text-[11px] text-slate-700">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={props.skipPin}
          onChange={(e) => props.setSkipPin(e.target.checked)}
        />
        <span>
          Skip the device PIN — the mirror key opens with this computer&apos;s login. A 4-digit PIN
          locks it on <strong>this device only</strong>; it is separate from the FarmCode.
        </span>
      </label>
      {!props.skipPin && (
        <input
          type="password"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          aria-label="4-digit device PIN"
          placeholder="4-digit device PIN"
          value={props.devicePin}
          onChange={(e) => setPin(e.target.value)}
          className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono tracking-widest text-sm"
        />
      )}
    </div>
  );
}
