import React, { useEffect, useState } from 'react';
import { Thermometer } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useMapStore } from '../lib/mapStore';
import { DryerPerformance } from '../components/DryerPerformance';
import { FarmDryersPanel } from '../components/harvest/FarmDryersPanel';

export function Drying() {
  const { userData } = useAuth();
  const farmId = userData?.farmId;
  const { blocks, loadData, isLoaded } = useMapStore();
  const [dryerRev, setDryerRev] = useState(0);

  useEffect(() => {
    if (farmId && !isLoaded) void loadData(farmId);
  }, [farmId, isLoaded, loadData]);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4 pb-24 lg:pb-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 inline-flex items-center gap-2">
          <Thermometer className="w-6 h-6 text-amber-600" />
          Drying
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Configure dryers, then log moisture sessions. Yield records live under Harvest.
        </p>
      </div>
      <FarmDryersPanel onSaved={() => setDryerRev((n) => n + 1)} />
      <React.Fragment key={dryerRev}>
        <DryerPerformance
          blocks={blocks.map((b) => ({ id: b.id, name: b.name, cultivar: b.cultivar || '' }))}
        />
      </React.Fragment>
    </div>
  );
}
