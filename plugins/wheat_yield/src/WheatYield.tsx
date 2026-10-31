import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Wheat } from 'lucide-react';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useMapStore } from '../../../src/lib/mapStore';
import { HarvestLoss } from './HarvestLoss';
import { isWheatScoutPaddock } from './wheatPaddock';
import { WheatYieldScience } from './WheatYieldScience';
import { WheatYieldScout } from './WheatYieldScout';

type AssessmentTab = 'yield' | 'loss';

/** Crop assessment: the yield scout, and a separate harvest-loss check. */
export function WheatYield() {
  const { userData } = useAuth();
  const farmId = userData?.farmId;
  const { blocks, loadData, isLoaded } = useMapStore();
  const [params] = useSearchParams();
  const paddocks = useMemo(() => blocks.filter(isWheatScoutPaddock), [blocks]);
  const [blockId, setBlockId] = useState('');
  const [tab, setTab] = useState<AssessmentTab>('yield');

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

  const block = paddocks.find((item) => item.id === blockId);

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4 min-w-0">
      <header className="min-w-0 space-y-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 inline-flex items-center gap-2">
            <Wheat className="w-5 h-5 text-amber-600 shrink-0" />
            Crop assessment
          </h1>
          <p className="text-sm text-slate-600 mt-1 break-words">
            {tab === 'yield'
              ? 'Walk square metres in a wheat paddock. Count heads, then sockets and grains down one side of a head.'
              : 'Weigh the grain from a drop tray, or count the grains. Several trays can go on one header.'}
          </p>
        </div>
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          <TabButton pressed={tab === 'yield'} onClick={() => setTab('yield')}>
            Yield
          </TabButton>
          <TabButton pressed={tab === 'loss'} onClick={() => setTab('loss')}>
            Harvest loss
          </TabButton>
        </div>
      </header>

      {paddocks.length === 0 ? (
        <p className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
          No wheat paddock yet. Draw a broadacre paddock, or set its crop to wheat.
        </p>
      ) : (
        <>
          <label className="block text-sm text-slate-700 min-w-0 bg-white rounded-xl border border-slate-200 p-4">
            Paddock
            <select
              className="mt-1 w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2"
              value={blockId}
              onChange={(event) => setBlockId(event.target.value)}
            >
              {paddocks.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name || 'Paddock'}
                  {item.cultivar ? ` · ${item.cultivar}` : ''}
                  {item.areaHa ? ` · ${item.areaHa.toFixed(1)} ha mapped` : ''}
                </option>
              ))}
            </select>
          </label>
          {tab === 'yield' ? (
            <WheatYieldScout farmId={farmId} blockId={blockId} areaHa={block?.areaHa} />
          ) : (
            <HarvestLoss farmId={farmId} blockId={blockId} />
          )}
        </>
      )}

      {tab === 'yield' ? <WheatYieldScience /> : null}
    </div>
  );
}

function TabButton({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${pressed ? 'bg-amber-700 text-white' : 'text-slate-700'}`}
    >
      {children}
    </button>
  );
}
