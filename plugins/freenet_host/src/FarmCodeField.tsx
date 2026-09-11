/**
 * Prefix-badge FarmCode input. Must not be used to echo a recovered code.
 */
import {
  FARM_CODE_BODY_LEN,
  FARM_CODE_LEGACY_BODY_LEN,
  FARM_CODE_LEGACY_VERSION,
  FARM_CODE_VERSION,
  farmCodeSymbolCount,
  farmCodeVersionForBody,
  formatFarmCodeInput,
} from '../../../units/mist-freenet/src/index.ts';

export function FarmCodeField({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const typed = farmCodeSymbolCount(value);
  const detected = farmCodeVersionForBody(value);
  const expected = typed > FARM_CODE_BODY_LEN ? FARM_CODE_LEGACY_BODY_LEN : FARM_CODE_BODY_LEN;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          FarmCode
        </label>
        <span className={`font-mono text-[11px] ${detected ? 'text-emerald-700' : 'text-slate-400'}`}>
          {typed}/{expected}
        </span>
      </div>
      <div className="flex items-stretch rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-violet-500 overflow-hidden">
        <span className="flex items-center px-3 bg-slate-100 text-slate-500 font-mono text-xs border-r border-slate-200 select-none">
          {detected ?? FARM_CODE_VERSION}
        </span>
        <input
          id={id}
          required
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(formatFarmCodeInput(e.target.value))}
          placeholder="XXXXX-XXXXX-XXXXX-XX"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="flex-1 min-w-0 px-3 py-3 font-mono text-base sm:text-lg tracking-[0.15em] uppercase focus:outline-none"
        />
      </div>
      <p className="text-[11px] text-slate-500">
        Type the {FARM_CODE_BODY_LEN} letters and numbers from your paper wallet — dashes and the{' '}
        <code>{FARM_CODE_VERSION}</code> label fill themselves in. Older{' '}
        <code>{FARM_CODE_LEGACY_VERSION}</code> codes ({FARM_CODE_LEGACY_BODY_LEN} symbols) still
        work; pasting a whole line is fine.
      </p>
    </div>
  );
}
