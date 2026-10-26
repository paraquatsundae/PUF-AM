import { useEffect } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { getInfraType, isSensorInfraType } from '../../../shared/farm/infraTypes';
import { effectiveSensorRadiusM, formatSensorRadius } from '../../../shared/farm/sensorCoverage';
import { useSensorCoverageRadii } from '../../hooks/useSensorCoverageRadii';
import type { InfrastructurePin } from '../../lib/mapStore';

const PLACEHOLDER_ROWS = [
  { time: '—', value: '—', flag: '—' },
  { time: '—', value: '—', flag: '—' },
  { time: '—', value: '—', flag: '—' },
  { time: '—', value: '—', flag: '—' },
];

/**
 * Move the pin to just outside the panel's top-left so the card sits down and
 * to the right of the marker. Skip the pan when the pin is already clear.
 */
function keepPinClearOfPanel(map: LeafletMap, pin: InfrastructurePin, panel: HTMLElement) {
  const mapRect = map.getContainer().getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const pinPx = map.latLngToContainerPoint([pin.lat, pin.lng]);
  const pad = 18;
  const targetX = panelRect.left - mapRect.left - pad;
  const targetY = panelRect.top - mapRect.top - pad;
  if (pinPx.x <= targetX && pinPx.y <= targetY) return;
  map.panBy([pinPx.x - targetX, pinPx.y - targetY], { animate: true });
}

export function SensorReadoutPanel({
  pin,
  farmId,
  map,
  onClose,
}: {
  pin: InfrastructurePin;
  farmId?: string;
  map: LeafletMap | null;
  onClose: () => void;
}) {
  const radii = useSensorCoverageRadii(farmId);
  const radius = isSensorInfraType(pin.type)
    ? formatSensorRadius(effectiveSensorRadiusM(pin.type, radii[pin.id]))
    : null;
  const kind = getInfraType(pin.type)?.label || 'Sensor';

  useEffect(() => {
    const panel = document.getElementById('sensor-readout');
    if (!map || !panel) return;
    keepPinClearOfPanel(map, pin, panel);
  }, [map, pin]);

  return (
    <section
      id="sensor-readout"
      className="absolute z-[1100] right-12 bottom-2 w-[calc(55%-3.25rem)] h-[calc(55%-0.5rem)] min-h-[15.4rem] bg-white/95 backdrop-blur border border-slate-200 rounded-tl-2xl shadow-xl flex flex-col overflow-hidden pointer-events-auto"
      aria-label={`${pin.name} readout`}
    >
      <header className="flex items-start justify-between gap-2 px-3 py-2 border-b border-slate-200">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900 truncate">{pin.name || 'Sensor'}</h2>
          <p className="text-[11px] text-slate-500">
            {kind}
            {radius ? ` · ${radius}` : ''} · {pin.status} · {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-xs font-semibold text-slate-500 hover:text-slate-900 px-2 py-1"
        >
          Close
        </button>
      </header>

      <div className="px-3 py-2 grid grid-cols-3 gap-2 text-center">
        <Stat label="Uptime" value="—" />
        <Stat label="Errors" value="—" />
        <Stat label="Last reading" value="—" />
      </div>

      <div className="mx-3 mb-2 flex-1 min-h-[4.5rem] rounded-xl border border-dashed border-slate-300 bg-slate-50 flex flex-col">
        <p className="px-2 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Output
        </p>
        <svg viewBox="0 0 120 36" className="w-full flex-1 text-slate-300" aria-hidden>
          <path d="M4 28 H116" fill="none" stroke="currentColor" strokeDasharray="3 3" />
          <path d="M4 8 V28" fill="none" stroke="currentColor" strokeDasharray="3 3" />
        </svg>
        <p className="px-2 pb-1.5 text-[11px] text-slate-400">No readings yet</p>
      </div>

      <div className="mx-3 mb-2 overflow-auto max-h-24 rounded-xl border border-slate-200">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-2 py-1 font-semibold">Time</th>
              <th className="px-2 py-1 font-semibold">Value</th>
              <th className="px-2 py-1 font-semibold">Flag</th>
            </tr>
          </thead>
          <tbody>
            {PLACEHOLDER_ROWS.map((row, index) => (
              <tr key={index} className="border-t border-slate-100 text-slate-400">
                <td className="px-2 py-1">{row.time}</td>
                <td className="px-2 py-1">{row.value}</td>
                <td className="px-2 py-1">{row.flag}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="px-3 pb-2 text-[10px] text-slate-400">
        Placeholder. Nothing is connected to this sensor yet.
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 px-1.5 py-1">
      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</p>
      <p className="text-sm font-semibold text-slate-700">{value}</p>
    </div>
  );
}
