/**
 * Trays made on the farm, kept on this device so the next paddock can use them.
 * A harvest-loss save also copies the list onto the paddock document.
 * Plans/NAMING.md `pufam.harvestLoss.trays.v1.{farmId}`.
 */
import { parseCustomTrays, type CustomTray } from './estimateHarvestLoss';

export function harvestLossTrayKey(farmId: string): string {
  return `pufam.harvestLoss.trays.v1.${farmId}`;
}

export function readCustomTrays(farmId: string | undefined): CustomTray[] {
  if (!farmId || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(harvestLossTrayKey(farmId));
    return parseCustomTrays(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

export function writeCustomTrays(farmId: string | undefined, trays: CustomTray[]): void {
  if (!farmId || typeof localStorage === 'undefined') return;
  localStorage.setItem(harvestLossTrayKey(farmId), JSON.stringify(parseCustomTrays(trays)));
}

/** Incoming trays replace the same id. Trays only on this device stay. */
export function mergeCustomTrays(local: CustomTray[], incoming: CustomTray[]): CustomTray[] {
  const byId = new Map(local.map((tray) => [tray.id, tray]));
  for (const tray of incoming) byId.set(tray.id, tray);
  return parseCustomTrays([...byId.values()]);
}
