import type { InfrastructurePin } from '../../lib/mapStore';
import { cn } from '../../lib/utils';
import {
  getInfraType,
  INFRA_TYPES,
  infraSubtractsFromPaddock,
  type InfraTypeId,
} from '../../../shared/farm/infraTypes';

export function EditInfraSidebar({
  pins,
  infraDrawKind,
  setInfraDrawKind,
  onSelectPin,
}: {
  pins: InfrastructurePin[];
  infraDrawKind: Exclude<InfraTypeId, ''>;
  setInfraDrawKind: (id: Exclude<InfraTypeId, ''>) => void;
  onSelectPin: (pinId: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          Draw type
        </div>
        <div className="flex flex-wrap gap-1.5">
          {INFRA_TYPES.map((t) => {
            const selected = infraDrawKind === t.id;
            const modeHint =
              t.draw === 'polygon' ? 'area' : t.draw === 'line' ? 'line' : 'pin';
            const areaHint = infraSubtractsFromPaddock(t.id)
              ? ' · cuts paddock area'
              : t.id === 'internal_passable'
                ? ' · keeps paddock area'
                : '';
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setInfraDrawKind(t.id)}
                title={`${t.label} — draw as ${modeHint}${areaHint}. ${t.blurb}`}
                className={cn(
                  'px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors',
                  selected
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-700'
                )}
              >
                {t.shortLabel}
                <span
                  className={cn(
                    'ml-1 font-normal',
                    selected ? 'text-indigo-100' : 'text-slate-400'
                  )}
                >
                  · {modeHint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {pins.length > 0 ? (
        pins.map((pin) => (
          <div
            key={pin.id}
            onClick={() => onSelectPin(pin.id)}
            className="p-3 border border-slate-200 rounded-xl hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer bg-white group"
          >
            <div className="flex justify-between items-start mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={`w-2 h-2 shrink-0 rounded-full ${
                    pin.status === 'active'
                      ? 'bg-emerald-500 animate-pulse'
                      : pin.status === 'warning'
                        ? 'bg-amber-500'
                        : 'bg-slate-300'
                  }`}
                />
                <div className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors truncate">
                  {pin.name || 'Unnamed asset'}
                </div>
              </div>
              <div className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md shrink-0 ml-2 max-w-[9rem] truncate" title={getInfraType(pin.type)?.label || pin.type || 'Unassigned'}>
                {getInfraType(pin.type)?.label || pin.type || 'Unassigned'}
              </div>
            </div>
            <div className="text-xs text-slate-400 font-mono">
              {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
            </div>

            {/* Phase 3.3: Live Telemetry Mock — sensors only */}
            {pin.status === 'active' &&
              (pin.type === 'weather' ||
                pin.type === 'soil' ||
                pin.type === 'irrigation') && (
                <div className="mt-2 pt-2 border-t border-slate-100 flex gap-4">
                  {pin.type === 'weather' && (
                    <>
                      <div className="flex flex-col">
                        <span className="text-[9px] text-slate-400 uppercase font-semibold">
                          Temp
                        </span>
                        <span className="text-xs font-medium text-slate-700">24.5°C</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] text-slate-400 uppercase font-semibold">
                          Humidity
                        </span>
                        <span className="text-xs font-medium text-slate-700">62%</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] text-slate-400 uppercase font-semibold">
                          Wind
                        </span>
                        <span className="text-xs font-medium text-slate-700">12 km/h</span>
                      </div>
                    </>
                  )}
                  {pin.type === 'soil' && (
                    <>
                      <div className="flex flex-col">
                        <span className="text-[9px] text-slate-400 uppercase font-semibold">
                          Moisture
                        </span>
                        <span className="text-xs font-medium text-slate-700">32% VWC</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] text-slate-400 uppercase font-semibold">
                          Temp
                        </span>
                        <span className="text-xs font-medium text-slate-700">18.2°C</span>
                      </div>
                    </>
                  )}
                  {pin.type === 'irrigation' && (
                    <>
                      <div className="flex flex-col">
                        <span className="text-[9px] text-slate-400 uppercase font-semibold">
                          Flow Rate
                        </span>
                        <span className="text-xs font-medium text-slate-700">45 L/h</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] text-slate-400 uppercase font-semibold">
                          Pressure
                        </span>
                        <span className="text-xs font-medium text-slate-700">2.1 bar</span>
                      </div>
                    </>
                  )}
                </div>
              )}
          </div>
        ))
      ) : (
        <div className="p-4 border-2 border-dashed border-slate-200 rounded-xl text-center space-y-2">
          <p className="text-sm text-slate-500">No infrastructure defined yet.</p>
          <p className="text-xs text-slate-400">
            Pick a type above, then draw dams, pads, hazard zones, pipes, or place pins on the
            map. Impassable areas and dams reduce paddock usable area; passable pads do not.
          </p>
        </div>
      )}
    </div>
  );
}
