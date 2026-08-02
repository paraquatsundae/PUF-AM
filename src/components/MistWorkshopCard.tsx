import React, { useState } from 'react';
import { Cloud, Database, FlaskConical, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  getFarmStoreBackend,
  isMistExperimentalEnabled,
  setFarmStoreBackend,
  type FarmStoreBackendPreference,
} from '../mist/farmStoreBackend.ts';
import { readBonesWorkshopSmoke, runBonesWorkshopSmoke } from '../mist/bonesWorkshop.ts';

export function MistWorkshopCard() {
  const { userData } = useAuth();
  const farmId = userData?.farmId;
  const [backend, setBackend] = useState<FarmStoreBackendPreference>(() => getFarmStoreBackend());
  const [smokeBusy, setSmokeBusy] = useState(false);
  const [smokeResult, setSmokeResult] = useState<string | null>(null);

  if (!isMistExperimentalEnabled() && backend !== 'mist') {
    return null;
  }

  const onBackendChange = (next: FarmStoreBackendPreference) => {
    setFarmStoreBackend(next);
    setBackend(next);
    setSmokeResult(null);
  };

  const runSmoke = async () => {
    if (!farmId) return;
    setSmokeBusy(true);
    setSmokeResult(null);
    try {
      const result = await runBonesWorkshopSmoke(farmId);
      setSmokeResult(
        result.roundTripOk
          ? `OK — put/get bones @ ${result.key} (hash ${result.contentHash.slice(0, 12)}…)`
          : 'Round-trip failed',
      );
    } catch (err) {
      setSmokeResult(err instanceof Error ? err.message : 'Smoke test failed');
    } finally {
      setSmokeBusy(false);
    }
  };

  const readSmoke = async () => {
    if (!farmId) return;
    setSmokeBusy(true);
    try {
      const result = await readBonesWorkshopSmoke(farmId);
      setSmokeResult(
        result
          ? `Read OK — ${result.payloadPreview}`
          : 'No workshop bones blob yet — run put/get first',
      );
    } catch (err) {
      setSmokeResult(err instanceof Error ? err.message : 'Read failed');
    } finally {
      setSmokeBusy(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-violet-200 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-violet-50 rounded-xl text-violet-700">
          <FlaskConical className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Mist workshop (experimental)</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Phase 4 — in-memory FarmStore smoke tests. Firebase remains default for production farms.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onBackendChange('firebase')}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium ${
            backend === 'firebase'
              ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
              : 'border-slate-200 text-slate-600'
          }`}
        >
          <Cloud className="w-4 h-4" />
          Firebase (default)
        </button>
        <button
          type="button"
          onClick={() => onBackendChange('mist')}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium ${
            backend === 'mist'
              ? 'border-violet-500 bg-violet-50 text-violet-900'
              : 'border-slate-200 text-slate-600'
          }`}
        >
          <Database className="w-4 h-4" />
          Mist memory
        </button>
      </div>

      {backend === 'mist' && farmId && (
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <p className="text-[11px] text-slate-500">
            FarmId (derived): <code className="font-mono text-[10px]">{farmId}</code>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={smokeBusy}
              onClick={() => void runSmoke()}
              className="px-3 py-2 rounded-lg bg-violet-700 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {smokeBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Bones put/get smoke
            </button>
            <button
              type="button"
              disabled={smokeBusy}
              onClick={() => void readSmoke()}
              className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
            >
              Read last blob
            </button>
          </div>
          {smokeResult && (
            <p className="text-[11px] font-mono text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 break-all">
              {smokeResult}
            </p>
          )}
        </div>
      )}

      {backend === 'mist' && !farmId && (
        <p className="text-xs text-amber-700">Sign in to a mist farm to run bones smoke tests.</p>
      )}
    </div>
  );
}
