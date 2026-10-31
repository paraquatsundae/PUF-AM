import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import { isWorkshopMode } from '../lib/workshopMode';
import {
  loadWorkshopFarm,
  subscribeWorkshopFarm,
  writeWorkshopFarm,
} from '../lib/workshopFarmState';
import {
  emptyFieldBinSettings,
  movementToWrite,
  parseFieldBinMovement,
  parseFieldBinMovements,
  parseFieldBinSettings,
  planTransfer,
  planTruckLoad,
  settingsToWrite,
  levelChangeError,
  moistureChangeError,
  stockByBin,
  stockByVehicle,
  type FieldBinMovement,
  type FieldBinSettings,
  type FieldBinVehicle,
  type TransferDraft,
  type FieldBinTrailer,
  type TruckFill,
} from '../../shared/farm/fieldBinStock';

export function useFieldBinData(farmId: string | undefined, canWrite = false) {
  const workshop = isWorkshopMode();
  const [settings, setSettings] = useState<FieldBinSettings>(emptyFieldBinSettings());
  const [movements, setMovements] = useState<FieldBinMovement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workshop) return;
    const apply = () => {
      const local = loadWorkshopFarm();
      setSettings(parseFieldBinSettings(local.fieldBinSettings));
      setMovements(parseFieldBinMovements(local.fieldBinMovements));
      setLoading(false);
    };
    apply();
    return subscribeWorkshopFarm(apply);
  }, [workshop]);

  useEffect(() => {
    if (workshop) return;
    if (!farmId) {
      setSettings(emptyFieldBinSettings());
      setMovements([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, 'farms', farmId, 'settings', 'field_bins');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setSettings(emptyFieldBinSettings());
          if (canWrite) {
            void setDoc(ref, { vehicles: [], bins: {} }).catch((error) => {
              try {
                handleFirestoreError(error, OperationType.WRITE, `farms/${farmId}/settings/field_bins`);
              } catch {
                /* already logged */
              }
            });
          }
          setLoading(false);
          return;
        }
        setSettings(parseFieldBinSettings(snap.data()));
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        try {
          handleFirestoreError(error, OperationType.GET, `farms/${farmId}/settings/field_bins`);
        } catch {
          /* already logged */
        }
      }
    );
    return () => unsub();
  }, [farmId, canWrite, workshop]);

  useEffect(() => {
    if (workshop || !farmId) return;
    const ref = collection(db, 'farms', farmId, 'field_bin_movements');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const rows: FieldBinMovement[] = [];
        snap.forEach((docSnap) => {
          const parsed = parseFieldBinMovement({ id: docSnap.id, ...docSnap.data() });
          if (parsed) rows.push(parsed);
        });
        setMovements(rows);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, `farms/${farmId}/field_bin_movements`);
        } catch {
          /* already logged */
        }
      }
    );
    return () => unsub();
  }, [farmId, workshop]);

  const stock = useMemo(() => stockByBin(movements), [movements]);
  const vehicleStock = useMemo(() => stockByVehicle(movements), [movements]);

  const writeSettings = useCallback(
    async (next: FieldBinSettings) => {
      const parsed = settingsToWrite(next);
      if (workshop) {
        writeWorkshopFarm({ ...loadWorkshopFarm(), fieldBinSettings: parsed });
        setSettings(parsed);
        return;
      }
      if (!farmId) return;
      await setDoc(doc(db, 'farms', farmId, 'settings', 'field_bins'), parsed);
      setSettings(parsed);
    },
    [farmId, workshop]
  );

  const persistMovement = useCallback(
    async (movement: FieldBinMovement) => {
      if (workshop) {
        const next = [...parseFieldBinMovements(loadWorkshopFarm().fieldBinMovements), movement];
        writeWorkshopFarm({ ...loadWorkshopFarm(), fieldBinMovements: next });
        setMovements(next);
        return { ok: true as const, movement };
      }
      if (!farmId) return { ok: false as const, error: 'No farm is open.' };
      await setDoc(doc(db, 'farms', farmId, 'field_bin_movements', movement.id), movement);
      return { ok: true as const, movement };
    },
    [farmId, workshop]
  );

  const commitTransfer = useCallback(
    async (draft: Omit<TransferDraft, 'vehicleCapacityT' | 'bins'> & { vehicleId: string; note?: string }) => {
      const vehicle = settings.vehicles.find((row) => row.id === draft.vehicleId);
      if (!vehicle) return { ok: false as const, error: 'Choose a chaser or a truck.' };
      const bins: TransferDraft['bins'] = {};
      for (const line of draft.lines) {
        const record = settings.bins[line.binId];
        if (!record) continue;
        const held = stock[line.binId];
        bins[line.binId] = {
          tonnes: held?.tonnes ?? 0,
          capacityT: record.capacityT ?? 0,
          moisture: held?.moisture ?? null,
        };
      }
      const planned = planTransfer({
        vehicleCapacityT: vehicle.capacityT,
        direction: draft.direction,
        moisture: draft.moisture,
        lines: draft.lines,
        bins,
      });
      if (!planned.ok) return planned;
      const movement: FieldBinMovement = movementToWrite({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        vehicleId: vehicle.id,
        direction: draft.direction,
        ...(draft.direction === 'in' ? { moisture: draft.moisture } : {}),
        ...(planned.mixMoisture != null ? { mixMoisture: planned.mixMoisture } : {}),
        ...(draft.note?.trim() ? { note: draft.note.trim() } : {}),
        lines: planned.lines,
      });
      return persistMovement(movement);
    },
    [persistMovement, settings, stock]
  );

  const commitTruckLoad = useCallback(
    async (draft: { vehicleId: string; trailers?: FieldBinTrailer[]; fills: TruckFill[] }) => {
      const vehicle = settings.vehicles.find((row) => row.id === draft.vehicleId && row.kind === 'truck');
      if (!vehicle) return { ok: false as const, error: 'Save the truck first.' };
      const trailers = draft.trailers?.length
        ? draft.trailers
        : vehicle.trailers?.length
          ? vehicle.trailers
          : [{ id: vehicle.id, capacityT: vehicle.capacityT }];
      const bins: TransferDraft['bins'] = {};
      for (const fill of draft.fills) {
        const record = settings.bins[fill.binId];
        if (!record) continue;
        const held = stock[fill.binId];
        bins[fill.binId] = {
          tonnes: held?.tonnes ?? 0,
          capacityT: record.capacityT ?? 0,
          moisture: held?.moisture ?? null,
        };
      }
      const planned = planTruckLoad({ trailers, fills: draft.fills, bins });
      if (!planned.ok) return planned;
      const movement = movementToWrite({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        vehicleId: vehicle.id,
        direction: 'out',
        ...(planned.mixMoisture != null ? { mixMoisture: planned.mixMoisture } : {}),
        lines: planned.lines,
      });
    return persistMovement(movement);
  },
  [persistMovement, settings, stock]
);

const clearHeld = useCallback(
  async (target: { kind: 'bin' | 'vehicle'; id: string }) => {
    if (target.kind === 'bin') {
      const held = stock[target.id];
      if (!held || held.tonnes <= 0) return { ok: true as const };
      const movement = movementToWrite({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        vehicleId: 'clear',
        direction: 'out',
        clear: 'bin',
        ...(held.moisture != null ? { mixMoisture: held.moisture } : {}),
        lines: [{ binId: target.id, percent: 100, base: 'bin', tonnes: held.tonnes }],
      });
      return persistMovement(movement);
    }
    const held = vehicleStock[target.id];
    if (!held || held.tonnes <= 0) return { ok: true as const };
    const movement = movementToWrite({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      vehicleId: target.id,
      direction: 'out',
      clear: 'vehicle',
      ...(held.moisture != null ? { mixMoisture: held.moisture } : {}),
      lines: [],
    });
    return persistMovement(movement);
  },
  [persistMovement, stock, vehicleStock]
);

  const setBinLevel = useCallback(
    async (binId: string, tonnes: number) => {
      const problem = levelChangeError(settings.bins[binId]?.capacityT ?? null, tonnes);
      if (problem) return { ok: false as const, error: problem };
      const held = stock[binId]?.tonnes ?? 0;
      if (Math.abs(held - tonnes) < 1e-6) return { ok: true as const };
      const movement = movementToWrite({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        vehicleId: 'level',
        direction: 'out',
        setLevel: true,
        lines: [{ binId, percent: 0, base: 'bin', tonnes }],
      });
      return persistMovement(movement);
    },
    [persistMovement, settings.bins, stock]
  );

  const setBinMoisture = useCallback(
    async (binId: string, moisture: number) => {
      const held = stock[binId];
      const tonnes = held?.tonnes ?? 0;
      const problem = moistureChangeError(tonnes, moisture);
      if (problem) return { ok: false as const, error: problem };
      if (held?.moisture != null && Math.abs(held.moisture - moisture) < 1e-6) return { ok: true as const };
      const movement = movementToWrite({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        vehicleId: 'moisture',
        direction: 'out',
        setMoisture: true,
        moisture,
        lines: [{ binId, percent: 0, base: 'bin', tonnes }],
      });
      return persistMovement(movement);
    },
    [persistMovement, stock]
  );

  return {
    settings,
    movements,
    stock,
    vehicleStock,
    loading,
    writeSettings,
    commitTransfer,
    commitTruckLoad,
    clearHeld,
    setBinLevel,
    setBinMoisture,
  };
}

export type { FieldBinVehicle };
