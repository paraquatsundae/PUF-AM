import { useCallback, useEffect, useState } from 'react';
import { canWriteFarmData } from '../../../shared/auth/farmModules';
import { isPackActive } from '../../../shared/farm/cropPacks';
import { FIELD_BINS_PACK_ID } from '../../../shared/farm/fieldBinsPackage';
import type { FieldBinVehicle, FieldBinVehicleKind } from '../../../shared/farm/fieldBinStock';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useFieldBinData } from '../../../src/hooks/useFieldBinData';
import { useMapStore, type InfrastructurePin } from '../../../src/lib/mapStore';
import { FieldBinChaserPage } from './FieldBinChaserPage';
import { FieldBinHistoryPage } from './FieldBinHistoryPage';
import { FieldBinMap } from './FieldBinMap';
import { FieldBinModeSwitch, type FieldBinMode } from './FieldBinModeSwitch';
import { FieldBinStatusSheet } from './FieldBinStatusSheet';
import { FieldBinTripSheet } from './FieldBinTripSheet';
import { FieldBinTruckPage } from './FieldBinTruckPage';

function nextBinName(pins: InfrastructurePin[]): string {
  const names = new Set(pins.filter((pin) => pin.type === 'field_bin').map((pin) => pin.name));
  let n = 1;
  while (names.has(`Field bin ${n}`)) n += 1;
  return `Field bin ${n}`;
}

export function FieldBins() {
  const { farmCropPacks, userData } = useAuth();
  const farmId = userData?.farmId;
  const canEdit = canWriteFarmData(userData?.role);
  const { blocks, pins, loadData, isLoaded, addPin, updatePin } = useMapStore();
  const { settings, movements, stock, vehicleStock, writeSettings, commitTransfer, commitTruckLoad, clearHeld, setBinLevel, setBinMoisture } =
    useFieldBinData(farmId, canEdit);
  const [mode, setMode] = useState<FieldBinMode>('map');
  const [paddockId, setPaddockId] = useState<string | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);

  useEffect(() => {
    if (farmId && !isLoaded) void loadData(farmId);
  }, [farmId, isLoaded, loadData]);

  const placePin = useCallback(
    (lat: number, lng: number) => {
      if (!canEdit) return;
      const pin: InfrastructurePin = {
        id: crypto.randomUUID(),
        name: nextBinName(pins),
        type: 'field_bin',
        status: 'active',
        lat,
        lng,
      };
      void addPin(pin);
      setDropping(false);
      setSelectedPinId(pin.id);
      setStorageOpen(false);
    },
    [addPin, canEdit, pins]
  );

  const saveBin = (capacityT: number, cropLabel: string) => {
    if (!selectedPinId) return;
    const bins = {
      ...settings.bins,
      [selectedPinId]: cropLabel ? { capacityT, cropLabel } : { capacityT },
    };
    void writeSettings({ ...settings, bins });
  };

  const addVehicle = (kind: FieldBinVehicleKind, name: string, capacityT: number) => {
    const id = crypto.randomUUID();
    void writeSettings({
      ...settings,
      vehicles: [...settings.vehicles, { id, kind, name, capacityT }],
    });
  };

  if (!isPackActive(farmCropPacks, FIELD_BINS_PACK_ID)) {
    return <p className="p-6 text-sm text-slate-500">Field bins is not active on this farm.</p>;
  }

  const selected = pins.find((pin) => pin.id === selectedPinId && pin.type === 'field_bin');

  if (mode === 'chaser') {
    return (
      <FieldBinChaserPage
        pins={pins}
        settings={settings}
        stock={stock}
        vehicleStock={vehicleStock}
        disabled={!canEdit}
        onMode={setMode}
        onClearVehicle={(vehicleId) => clearHeld({ kind: 'vehicle', id: vehicleId })}
        onCommit={(draft) => commitTransfer({ ...draft, direction: 'in' })}
        onSaveBin={(pinId, capacityT) => {
          const bins = { ...settings.bins, [pinId]: { ...settings.bins[pinId], capacityT } };
          void writeSettings({ ...settings, bins });
        }}
        onRename={(pinId, name) => updatePin(pinId, { name })}
        onVehicles={(vehicles) => void writeSettings({ ...settings, vehicles })}
      />
    );
  }

  const saveTruck = (truck: FieldBinVehicle) => {
    const exists = settings.vehicles.some((row) => row.id === truck.id);
    const vehicles = exists
      ? settings.vehicles.map((row) => (row.id === truck.id ? truck : row))
      : [...settings.vehicles, truck];
    void writeSettings({ ...settings, vehicles });
  };

  if (mode === 'bins') {
    return (
      <FieldBinHistoryPage
        pins={pins}
        blocks={blocks}
        settings={settings}
        stock={stock}
        movements={movements}
        disabled={!canEdit}
        onMode={setMode}
        onClearBin={(binId) => clearHeld({ kind: 'bin', id: binId })}
        onSaveCapacity={(pinId, capacityT) => {
          const bins = { ...settings.bins, [pinId]: { ...settings.bins[pinId], capacityT } };
          void writeSettings({ ...settings, bins });
        }}
        onSetLevel={setBinLevel}
        onSetMoisture={setBinMoisture}
      />
    );
  }

  if (mode === 'truck') {
    return (
      <FieldBinTruckPage
        pins={pins}
        settings={settings}
        stock={stock}
        vehicleStock={vehicleStock}
        disabled={!canEdit}
        onMode={setMode}
        onClearVehicle={(vehicleId) => clearHeld({ kind: 'vehicle', id: vehicleId })}
        onSaveTruck={saveTruck}
        onRemoveTruck={(id) =>
          void writeSettings({ ...settings, vehicles: settings.vehicles.filter((row) => row.id !== id) })
        }
        onCommit={commitTruckLoad}
      />
    );
  }

  return (
    <div className="relative flex-1 min-h-0 bg-slate-100">
      <FieldBinMap
        farmId={farmId}
        blocks={blocks}
        pins={pins}
        selectedPaddockId={paddockId}
        selectedPinId={selected?.id ?? null}
        dropping={dropping}
        onSelectPaddock={setPaddockId}
        onSelectPin={(id) => {
          setSelectedPinId(id);
          setDropping(false);
          setStorageOpen(false);
        }}
        onPlace={placePin}
        onClearPin={() => setSelectedPinId(null)}
      />

      <div className="absolute top-2 left-2 right-2 z-[500] flex flex-wrap items-center gap-2 pointer-events-none">
        <div className="pointer-events-auto rounded-xl bg-white shadow border border-slate-200">
          <FieldBinModeSwitch mode="map" onChange={setMode} />
        </div>
        <label className="pointer-events-auto flex items-center gap-2 rounded-xl bg-white/95 border border-slate-200 shadow px-2 py-1 text-sm">
          <span className="text-slate-500 text-xs font-semibold">Working in</span>
          <select
            value={paddockId ?? ''}
            onChange={(event) => setPaddockId(event.target.value || null)}
            className="bg-transparent py-1 pr-1 font-semibold text-slate-800 max-w-[10rem]"
          >
            <option value="">All paddocks</option>
            {blocks.map((block) => (
              <option key={block.id} value={block.id}>
                {block.name || 'Paddock'}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!canEdit}
          aria-pressed={dropping}
          onClick={() => {
            setDropping((on) => !on);
            setSelectedPinId(null);
          }}
          className={`pointer-events-auto px-3 py-2 rounded-xl text-sm font-semibold shadow ${
            dropping ? 'bg-amber-700 text-white' : 'bg-white text-slate-800 border border-slate-200'
          }`}
        >
          {dropping ? 'Tap the map' : 'Drop bin'}
        </button>
        <button
          type="button"
          onClick={() => setStorageOpen((open) => !open)}
          className="pointer-events-auto ml-auto px-3 py-2 rounded-xl bg-white text-slate-800 border border-slate-200 text-sm font-semibold shadow"
        >
          Storage
        </button>
      </div>

      {selected && !storageOpen && (
        <FieldBinTripSheet
          pin={selected}
          blocks={blocks}
          settings={settings}
          stock={stock}
          disabled={!canEdit}
          onClose={() => setSelectedPinId(null)}
          onCommit={commitTransfer}
          onSaveBin={saveBin}
          onAddVehicle={addVehicle}
        />
      )}

      {storageOpen && (
        <FieldBinStatusSheet
          pins={pins}
          blocks={blocks}
          settings={settings}
          stock={stock}
          disabled={!canEdit}
          onClose={() => setStorageOpen(false)}
          onSelectPin={(id) => {
            setSelectedPinId(id);
            setStorageOpen(false);
            setDropping(false);
          }}
          onVehicles={(vehicles) => void writeSettings({ ...settings, vehicles })}
        />
      )}
    </div>
  );
}
