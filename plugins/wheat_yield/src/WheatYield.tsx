import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Wheat } from 'lucide-react';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useMapStore } from '../../../src/lib/mapStore';
import { wheatYieldDefaults } from '../../../shared/farm/wheatYieldPackage';
import { DEFAULTS, estimateYield, type HeadCount } from './estimateYield';
import { useWheatScout } from './useWheatScout';
import { isWheatScoutPaddock } from './wheatPaddock';
import { WheatYieldScience } from './WheatYieldScience';

type CountDraft = { heads: string; height: string; width: string };

type Draft = {
  hectolitreWeight: string;
  deductionPercent: string;
  hectares: string;
  thousandGrainWeightOverride: string;
  counts: CountDraft[];
};

function blankCount(): CountDraft {
  return {
    heads: String(DEFAULTS.heads),
    height: String(DEFAULTS.height),
    width: String(DEFAULTS.width),
  };
}

function countsFromDraft(counts: CountDraft[]): HeadCount[] {
  return counts.map((count) => ({
    heads: num(count.heads),
    height: num(count.height),
    width: num(count.width),
  }));
}

function blankDraft(hectares: number | undefined): Draft {
  return {
    hectolitreWeight: String(wheatYieldDefaults.hectolitreWeight),
    deductionPercent: String(wheatYieldDefaults.deductionPercent),
    hectares: hectares && hectares > 0 ? String(hectares) : '',
    thousandGrainWeightOverride: '',
    counts: [blankCount()],
  };
}

function num(raw: string): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function tonnes(value: number): string {
  return value.toLocaleString('en-AU', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

export function WheatYield() {
  const { userData, user } = useAuth();
  const farmId = userData?.farmId;
  const { blocks, loadData, isLoaded } = useMapStore();
  const [params] = useSearchParams();
  const paddocks = useMemo(() => blocks.filter(isWheatScoutPaddock), [blocks]);
  const [blockId, setBlockId] = useState<string>('');
  const scout = useWheatScout(farmId, blockId || undefined);
  const [draft, setDraft] = useState<Draft>(() => blankDraft(undefined));
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const appliedKey = useRef('');

  useEffect(() => {
    if (farmId && !isLoaded) void loadData(farmId);
  }, [farmId, isLoaded, loadData]);

  useEffect(() => {
    const asked = params.get('paddock');
    if (asked && paddocks.some((block) => block.id === asked)) {
      setBlockId(asked);
      return;
    }
    if (!blockId && paddocks[0]) setBlockId(paddocks[0].id);
  }, [params, paddocks, blockId]);

  useEffect(() => {
    const block = paddocks.find((item) => item.id === blockId);
    if (!block || scout.loading) return;
    const key = `${blockId}:${scout.record?.updatedAt ?? 'new'}`;
    if (appliedKey.current === key) return;
    appliedKey.current = key;
    if (scout.record) {
      setDraft({
        hectolitreWeight: String(scout.record.hectolitreWeight),
        deductionPercent: String(scout.record.deductionPercent),
        hectares: String(scout.record.hectares),
        thousandGrainWeightOverride:
          scout.record.thousandGrainWeightOverride > 0 ? String(scout.record.thousandGrainWeightOverride) : '',
        counts: scout.record.counts.length
          ? scout.record.counts.map((count) => ({
              heads: String(count.heads),
              height: String(count.height),
              width: String(count.width),
            }))
          : [blankCount()],
      });
      return;
    }
    setDraft(blankDraft(block.areaHa));
  }, [blockId, scout.loading, scout.record, paddocks]);

  const result = estimateYield({
    counts: countsFromDraft(draft.counts),
    hectolitreWeight: num(draft.hectolitreWeight),
    deductionPercent: num(draft.deductionPercent),
    hectares: num(draft.hectares),
    thousandGrainWeightOverride: num(draft.thousandGrainWeightOverride),
  });

  const updateCount = (index: number, patch: Partial<CountDraft>) => {
    setDraft((current) => ({
      ...current,
      counts: current.counts.map((count, i) => (i === index ? { ...count, ...patch } : count)),
    }));
    setSavedNote(null);
  };

  const save = async () => {
    if (!user?.uid || !blockId) return;
    const ok = await scout.save(user.uid, {
      blockId,
      hectolitreWeight: num(draft.hectolitreWeight),
      deductionPercent: num(draft.deductionPercent),
      hectares: num(draft.hectares),
      thousandGrainWeightOverride: num(draft.thousandGrainWeightOverride),
      counts: countsFromDraft(draft.counts),
    });
    setSavedNote(ok ? 'Saved for this paddock.' : null);
  };

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4 min-w-0">
      <header className="min-w-0">
        <h1 className="text-xl font-semibold text-slate-900 inline-flex items-center gap-2">
          <Wheat className="w-5 h-5 text-amber-600 shrink-0" />
          Wheat yield
        </h1>
        <p className="text-sm text-slate-600 mt-1 break-words">
          Walk square metres in a wheat paddock. Count heads, then sockets and grains down one side of a head.
        </p>
      </header>

      {paddocks.length === 0 ? (
        <p className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
          No wheat paddock yet. Draw a broadacre paddock, or set its crop to wheat.
        </p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 space-y-4 min-w-0">
          <label className="block text-sm text-slate-700 min-w-0">
            Paddock
            <select
              className="mt-1 w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2"
              value={blockId}
              onChange={(event) => {
                setBlockId(event.target.value);
                setSavedNote(null);
              }}
            >
              {paddocks.map((block) => (
                <option key={block.id} value={block.id}>
                  {block.name || 'Paddock'}
                  {block.cultivar ? ` · ${block.cultivar}` : ''}
                  {block.areaHa ? ` · ${block.areaHa.toFixed(1)} ha mapped` : ''}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="kg/hL" value={draft.hectolitreWeight} onChange={(value) => setDraft({ ...draft, hectolitreWeight: value })} />
            <Field label="Deduction %" value={draft.deductionPercent} onChange={(value) => setDraft({ ...draft, deductionPercent: value })} />
            <Field label="Hectares" value={draft.hectares} onChange={(value) => setDraft({ ...draft, hectares: value })} />
            <Field label="Weighed TGW" value={draft.thousandGrainWeightOverride} onChange={(value) => setDraft({ ...draft, thousandGrainWeightOverride: value })} placeholder="HLW estimate" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-800">Square-metre counts</h2>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 shrink-0"
                onClick={() => setDraft({ ...draft, counts: [...draft.counts, blankCount()] })}
              >
                <Plus className="w-4 h-4" /> Add count
              </button>
            </div>
            <p className="text-xs text-slate-500">Width is grains on one side only. 2 thin, 3 average, 4 plump.</p>
            {draft.counts.map((count, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                <Field label={index === 0 ? 'Heads/m²' : ''} value={count.heads} onChange={(value) => updateCount(index, { heads: value })} />
                <Field label={index === 0 ? 'Height' : ''} value={count.height} onChange={(value) => updateCount(index, { height: value })} />
                <Field label={index === 0 ? 'Width' : ''} value={count.width} onChange={(value) => updateCount(index, { width: value })} />
                <button
                  type="button"
                  className="mb-1 p-2 text-slate-400"
                  aria-label={`Remove count ${index + 1}`}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      counts: draft.counts.filter((_, i) => i !== index),
                    })
                  }
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-sm text-slate-800 space-y-1 break-words">
            <p>
              <span className="font-semibold">{tonnes(result.tonnesPerHa)} t/ha</span>
              {' · '}
              {tonnes(result.totalTonnes)} t
              {' · '}
              {Math.round(result.grainsPerHead)} grains/head
            </p>
            <p className="text-slate-600">{result.note}</p>
            <p className="text-xs text-slate-500">
              {result.countCount} count{result.countCount === 1 ? '' : 's'} averaged
              {' · '}
              TGW {result.thousandGrainWeightUsed.toFixed(1)} g/1000
              {' · '}
              half-litre cup {Math.round(result.halfLitreCupGrams)} g
            </p>
          </div>

          {scout.error ? <p className="text-sm text-rose-600">{scout.error}</p> : null}
          {savedNote ? <p className="text-sm text-emerald-700">{savedNote}</p> : null}

          <button
            type="button"
            disabled={!user?.uid || scout.saving}
            onClick={() => void save()}
            className="rounded-lg bg-emerald-700 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {scout.saving ? 'Saving…' : 'Save paddock scout'}
          </button>
        </div>
      )}

      <WheatYieldScience />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-xs text-slate-500 min-w-0">
      {label || '\u00a0'}
      <input
        inputMode="decimal"
        className="mt-1 w-full min-w-0 rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
