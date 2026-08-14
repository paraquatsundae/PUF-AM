/**
 * Client I/O for crop-pack Install / Activate / Deactivate / Delete.
 * Pure planning lives in shared/farm/cropPacks.ts.
 */
import { deleteDoc, deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import {
  getCropPack,
  isCropPackId,
  migrateLegacyWalnutPack,
  planActivatePack,
  planDeactivatePack,
  planDeletePack,
  planInstallPack,
  resolveFarmCropPacks,
  type CropPackId,
  type CropPackLifecycleCtx,
  type FarmCropPacksMap,
} from '../../shared/farm/cropPacks';
import { resolveFarmEnabledModules, type FarmModuleId } from '../../shared/auth/farmModules';
import { db } from '../firebase';
import { updateFarmModules } from './invitePinAuth';

export type CropPackLifecycleResult = {
  cropPacks: FarmCropPacksMap;
  modules: FarmModuleId[];
};

async function readFarmPackState(farmId: string): Promise<{
  cropPacks: FarmCropPacksMap;
  modules: FarmModuleId[];
}> {
  const snap = await getDoc(doc(db, 'farms', farmId));
  const data = snap.data() || {};
  return {
    cropPacks: resolveFarmCropPacks(data.cropPacks),
    modules: resolveFarmEnabledModules(data.enabledModules),
  };
}

async function writeCropPacks(farmId: string, cropPacks: FarmCropPacksMap): Promise<void> {
  const ref = doc(db, 'farms', farmId);
  // Firestore merges map fields — clear first so Delete can drop pack keys.
  await updateDoc(ref, { cropPacks: deleteField() });
  if (Object.keys(cropPacks).length > 0) {
    await updateDoc(ref, { cropPacks });
  }
}

async function wipePackSettings(farmId: string, packId: CropPackId): Promise<void> {
  const pack = getCropPack(packId);
  if (!pack.settingsDocId) return;
  const ref = doc(db, 'farms', farmId, 'settings', pack.settingsDocId);
  const keys = pack.settingsOwnedKeys;
  if (keys && keys.length > 0) {
    // Merge-delete pack keys only. isValidModelParameters allows those fields
    // to be absent so economics on model_params survive.
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
  const state = await readFarmPackState(ctx.farmId);
  const result = migrateLegacyWalnutPack({
    cropPacks: state.cropPacks,
    modules: state.modules,
    profile: ctx.profile,
    blocks: ctx.blocks,
  });
  if (!result.migrated) {
    return { ...result, migrated: false };
  }
  await writeCropPacks(ctx.farmId, result.cropPacks);
  const modules = await updateFarmModules(result.modules);
  return { cropPacks: result.cropPacks, modules, migrated: true };
}

export async function installCropPack(
  ctx: CropPackLifecycleCtx,
  packId: CropPackId,
  opts?: { activate?: boolean }
): Promise<CropPackLifecycleResult> {
  if (!isCropPackId(packId)) throw new Error(`Unknown crop pack: ${packId}`);
  const pack = getCropPack(packId);
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
  const modules = await updateFarmModules(planned.modules);
  return { cropPacks: planned.cropPacks, modules };
}

export async function activateCropPack(
  ctx: CropPackLifecycleCtx,
  packId: CropPackId
): Promise<CropPackLifecycleResult> {
  if (!isCropPackId(packId)) throw new Error(`Unknown crop pack: ${packId}`);
  const state = await readFarmPackState(ctx.farmId);
  const planned = planActivatePack(
    state.cropPacks,
    state.modules,
    packId,
    new Date().toISOString()
  );
  await writeCropPacks(ctx.farmId, planned.cropPacks);
  const modules = await updateFarmModules(planned.modules);
  return { cropPacks: planned.cropPacks, modules };
}

export async function deactivateCropPack(
  ctx: CropPackLifecycleCtx,
  packId: CropPackId
): Promise<CropPackLifecycleResult> {
  if (!isCropPackId(packId)) throw new Error(`Unknown crop pack: ${packId}`);
  const state = await readFarmPackState(ctx.farmId);
  const planned = planDeactivatePack(state.cropPacks, state.modules, packId);
  await writeCropPacks(ctx.farmId, planned.cropPacks);
  const modules = await updateFarmModules(planned.modules);
  return { cropPacks: planned.cropPacks, modules };
}

export async function deleteCropPack(
  ctx: CropPackLifecycleCtx,
  packId: CropPackId
): Promise<CropPackLifecycleResult> {
  if (!isCropPackId(packId)) throw new Error(`Unknown crop pack: ${packId}`);
  const state = await readFarmPackState(ctx.farmId);
  const planned = planDeletePack(state.cropPacks, state.modules, packId);
  await wipePackSettings(ctx.farmId, packId);
  await writeCropPacks(ctx.farmId, planned.cropPacks);
  const modules = await updateFarmModules(planned.modules);
  return { cropPacks: planned.cropPacks, modules };
}
