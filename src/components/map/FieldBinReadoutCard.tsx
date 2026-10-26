import { useEffect } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { isPackActive } from '../../../shared/farm/cropPacks';
import { FIELD_BINS_PACK_ID } from '../../../shared/farm/fieldBinsPackage';
import {
  formatFillPercent,
  formatMoisture,
  formatTonnes,
} from '../../../shared/farm/fieldBinStock';
import { useAuth } from '../../contexts/AuthContext';
import { useFieldBinData } from '../../hooks/useFieldBinData';
import { findBlockIdAtPoint } from '../../lib/farmMapHit';
import type { InfrastructurePin, OrchardBlock } from '../../lib/mapStore';

function keepPinClear(map: LeafletMap, pin: InfrastructurePin, panel: HTMLElement) {
  const mapRect = map.getContainer().getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const pinPx = map.latLngToContainerPoint([pin.lat, pin.lng]);
  const targetX = panelRect.left - mapRect.left - 28;
  const targetY = panelRect.top - mapRect.top - 12;
  if (pinPx.x <= targetX && pinPx.y <= targetY) return;
  map.panBy([pinPx.x - targetX, pinPx.y - targetY], { animate: true });
}

/** Operate-mode card for one field bin. Stays down-right of the pin. */
export function FieldBinReadoutCard({
  pin,
  blocks,
  farmId,
  map,
  onClose,
}: {
  pin: InfrastructurePin;
  blocks: OrchardBlock[];
  farmId?: string;
  map: LeafletMap | null;
  onClose: () => void;
}) {
  const { farmCropPacks } = useAuth();
  const active = isPackActive(farmCropPacks, FIELD_BINS_PACK_ID);
  const { settings, stock } = useFieldBinData(active ? farmId : undefined, false);
  const record = settings.bins[pin.id];
  const held = stock[pin.id];
  const paddockId = findBlockIdAtPoint(blocks, pin.lat, pin.lng);
  const paddock = blocks.find((block) => block.id === paddockId)?.name;

  useEffect(() => {
    if (!active) onClose();
  }, [active, onClose]);

  useEffect(() => {
    const panel = document.getElementById('field-bin-readout');
    if (!map || !panel) return;
    keepPinClear(map, pin, panel);
  }, [map, pin]);

  if (!active) return null;

  return (
    <section
      id="field-bin-readout"
      className="absolute z-[1100] right-12 bottom-2 w-72 bg-white/95 backdrop-blur border border-slate-200 rounded-tl-2xl shadow-xl p-3 pointer-events-auto"
      aria-label={`${pin.name || 'Field bin'} stock`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900 truncate">{pin.name || 'Field bin'}</h2>
          <p className="text-[11px] text-slate-500">
            {paddock || 'No paddock'}
            {record?.cropLabel ? ` · ${record.cropLabel}` : ''}
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-xs font-semibold text-slate-500 px-1">
          Close
        </button>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
        <Stat label="Holding" value={formatTonnes(held?.tonnes ?? 0)} />
        <Stat
          label="Fill"
          value={record ? formatFillPercent(held?.tonnes ?? 0, record.capacityT) : '—'}
        />
        <Stat label="Moisture" value={formatMoisture(held?.moisture)} />
      </dl>
      {pin.notes && <p className="mt-2 text-xs text-slate-600">{pin.notes}</p>}
      {!record && <p className="mt-2 text-xs text-slate-400">Set a capacity on this bin to log trips.</p>}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 px-1 py-1">
      <dt className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</dt>
      <dd className="text-sm font-semibold text-slate-700">{value}</dd>
    </div>
  );
}
