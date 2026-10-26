/**
 * Client I/O for crop-pack Install / Activate / Deactivate / Delete.
 * Pure planning lives in shared/farm/cropPacks.ts.
 */
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  getInstallablePack,
  isInstallablePackId,
  migrateLegacyPacks,
  moduleListEquals,
  planActivatePack,
  planDeactivatePack,
  planDeletePack,
  planInstallPack,
  resolveFarmCropPacks,
  syncModulesWithCropPacks,
  type CropPackLifecycleCtx,
  type FarmCropPacksMap,
  type InstallablePackId,
} from '../../shared/farm/cropPacks';
import { resolveFarmEnabledModules, type FarmModuleId } from '../../shared/auth/farmModules';
import { db } from '../firebase';
import { updateFarmModules } from './invitePinAuth';
import { isLocalOnlyFarmSession } from './workshopMode';
import { loadWorkshopFarm, writeWorkshopFarm } from './workshopFarmState';
import { emptyFieldBinSettings } from '../../shared/farm/fieldBinStock';

export type CropPackLifecycleResult = {
  cropPacks: FarmCropPacksMap;
  modules: FarmModuleId[];
};

async function readFarmPackState(farmId: string): Promise<{
  /** Raw map — migrate must see dropped ids such as harvest_drying. */
  cropPacksRaw: unknown;
  cropPacks: FarmCropPacksMap;
  modules: FarmModuleId[];
}> {
  if (isLocalOnlyFarmSession()) {
    const local = loadWorkshopFarm();
    return {
      cropPacksRaw: local.cropPacks,
      cropPacks: resolveFarmCropPacks(local.cropPacks),
      modules: resolveFarmEnabledModules(local.modules),
    };
  }
  const snap = await getDoc(doc(db, 'farms', farmId));
  const data = snap.data() || {};
  return {
    cropPacksRaw: data.cropPacks,
    cropPacks: resolveFarmCropPacks(data.cropPacks),
    modules: resolveFarmEnabledModules(data.enabledModules),
  };
}

async function writeCropPacks(farmId: string, cropPacks: FarmCropPacksMap): Promise<void> {
  if (isLocalOnlyFarmSession()) {
    writeWorkshopFarm({ ...loadWorkshopFarm(), cropPacks });
    return;
  }
  const ref = doc(db, 'farms', farmId);
  // Firestore merges map fields — clear first so Delete can drop pack keys.
  await updateDoc(ref, { cropPacks: deleteField() });
  if (Object.keys(cropPacks).length > 0) {
    await updateDoc(ref, { cropPacks });
  }
}

async function persistModules(modules: FarmModuleId[]): Promise<FarmModuleId[]> {
  if (isLocalOnlyFarmSession()) {
    const resolved = resolveFarmEnabledModules(modules);
    writeWorkshopFarm({ ...loadWorkshopFarm(), modules: resolved });
    return resolved;
  }
  return updateFarmModules(modules);
}

async function wipePackSettings(farmId: string, packId: InstallablePackId): Promise<void> {
  const pack = getInstallablePack(packId);
  if (!pack.settingsDocId) return;
  if (isLocalOnlyFarmSession()) {
    if (pack.settingsDocId === 'sensors') {
      writeWorkshopFarm({
        ...loadWorkshopFarm(),
        sensorSettings: { bindings: {} },
      });
    }
    if (pack.settingsDocId === 'field_bins') {
      writeWorkshopFarm({
        ...loadWorkshopFarm(),
        fieldBinSettings: emptyFieldBinSettings(),
        fieldBinMovements: [],
      });
    }
    return;
  }
  if (pack.settingsDocId === 'field_bins') {
    const snap = await getDocs(collection(db, 'farms', farmId, 'field_bin_movements'));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach((row) => batch.delete(row.ref));
      await batch.commit();
    }
  }
  const ref = doc(db, 'farms', farmId, 'settings', pack.settingsDocId);
  const keys = pack.settingsOwnedKeys;
  if (keys && keys.length > 0) {
    // Merge-delete pack keys only so leftover fields on a shared settings doc survive.
    const patch: Record<string, ReturnType<typeof deleteField>> = {};
    for (const key of keys) patch[key] = deleteField();
    await setDoc(ref, patch, { merge: true });
    return;
  }
  // Whole-doc wipe — only when the pack owns the entire settings doc.
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref);
  }
}

export async function ensureLegacyWalnutPackMigrated(
  ctx: CropPackLifecycleCtx
): Promise<CropPackLifecycleResult & { migrated: boolean }> {
  return ensureLegacyPacksMigrated(ctx);
}

export async function ensureLegacyPacksMigrated(
  ctx: CropPackLifecycleCtx
): Promise<CropPackLifecycleResult & { migrated: boolean }> {
  const state = await readFarmPackState(ctx.farmId);
  const result = migrateLegacyPacks({
    cropPacks: state.cropPacksRaw,
    modules: state.modules,
    profile: ctx.profile,
    blocks: ctx.blocks,
  });
  const modules = syncModulesWithCropPacks(result.modules, result.cropPacks);
  const modulesChanged = !moduleListEquals(state.modules, modules);
  if (!result.migrated && !modulesChanged) {
    return { cropPacks: result.cropPacks, modules, migrated: false };
  }
  if (result.migrated) {
    await writeCropPacks(ctx.farmId, result.cropPacks);
  }
  const written = await persistModules(modules);
  return { cropPacks: result.cropPacks, modules: written, migrated: true };
}

export async function installCropPack(
  ctx: CropPackLifecycleCtx,
  packId: InstallablePackId,
  opts?: { activate?: boolean }
): Promise<CropPackLifecycleResult> {
  if (!isInstallablePackId(packId)) throw new Error(`Unknown pack: ${packId}`);
  const pack = getInstallablePack(packId);
  const check = pack.canInstall?.(ctx);
  if (check && check.hard && !check.ok) {
    throw new Error(check.hint || 'This pack cannot be installed on this farm.');
  }
  const state = await readFarmPackState(ctx.farmId);
  const nowIso = new Date().toISOString();
  const planned = planInstallPack(
    state.cropPacks,
    state.modules,
    packId,
    nowIso,
    opts?.activate !== false
  );
  await writeCropPacks(ctx.farmId, planned.cropPacks);
  const modules = await persistModules(planned.modules);
  return { cropPacks: planned.cropPacks, modules };
}

export async function activateCropPack(
  ctx: CropPackLifecycleCtx,
  packId: InstallablePackId
): Promise<CropPackLifecycleResult> {
  if (!isInstallablePackId(packId)) throw new Error(`Unknown pack: ${packId}`);
  const state = await readFarmPackState(ctx.farmId);
  const planned = planActivatePack(
    state.cropPacks,
    state.modules,
    packId,
    new Date().toISOString()
  );
  await writeCropPacks(ctx.farmId, planned.cropPacks);
  const modules = await persistModules(planned.modules);
  return { cropPacks: planned.cropPacks, modules };
}

export async function deactivateCropPack(
  ctx: CropPackLifecycleCtx,
  packId: InstallablePackId
): Promise<CropPackLifecycleResult> {
  if (!isInstallablePackId(packId)) throw new Error(`Unknown pack: ${packId}`);
  const state = await readFarmPackState(ctx.farmId);
  const planned = planDeactivatePack(
    state.cropPacks,
    state.modules,
    packId,
    new Date().toISOString()
  );
  await writeCropPacks(ctx.farmId, planned.cropPacks);
  const modules = await persistModules(planned.modules);
  return { cropPacks: planned.cropPacks, modules };
}

export async function deleteCropPack(
  ctx: CropPackLifecycleCtx,
  packId: InstallablePackId
): Promise<CropPackLifecycleResult> {
  if (!isInstallablePackId(packId)) throw new Error(`Unknown pack: ${packId}`);
  const state = await readFarmPackState(ctx.farmId);
  const planned = planDeletePack(state.cropPacks, state.modules, packId);
  await wipePackSettings(ctx.farmId, packId);
  await writeCropPacks(ctx.farmId, planned.cropPacks);
  const modules = await persistModules(planned.modules);
  return { cropPacks: planned.cropPacks, modules };
}
