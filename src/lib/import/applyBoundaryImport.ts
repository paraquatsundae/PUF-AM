/**
 * Apply parsed ISOXML/KML into PUFAM farms + OrchardBlocks (PUF-mobile-style).
 * Geometry writes are local-first (IndexedDB + queue) so import cannot hang on Firestore.
 */
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import type { OrchardBlock } from '../mapStore';
import { persistBlock, removeBlockPersisted } from '../farmGeometrySync';
import { getFarmGeometry } from '../farmGeometryIdb';
import { polygonFeatureFromRing } from '../boundaryGeometry';
import { flattenIsoxmlFarms, type IsoxmlFarm, type IsoxmlTree } from './isoxmlBoundaries';
import type { KmlField } from './kmlBoundaries';
import { isLocalOnlyFarmSession } from '../workshopMode';
import { v4 as uuidv4 } from 'uuid';

export type ImportConflictMode = 'keepBoth' | 'replaceMatching';

export type FarmImportResult = {
  farmId: string;
  farmName: string;
  createdFarm: boolean;
  intoCurrent: boolean;
  added: number;
  replaced: number;
  skipped: number;
};

export type ImportProgress = {
  phase: 'preparing' | 'importing' | 'done';
  farmName?: string;
  current: number;
  total: number;
  message: string;
};

function newBlock(name: string, boundary: [number, number][], areaHa: number): OrchardBlock {
  return {
    id: uuidv4(),
    name,
    cultivar: '',
    density: '',
    irrigation: '',
    areaHa,
    geojson: polygonFeatureFromRing(boundary),
  };
}

function yieldUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function ensureFarmDoc(opts: {
  farmId: string;
  name: string;
  ownerUid: string;
  lat?: number;
  lng?: number;
}): Promise<void> {
  if (isLocalOnlyFarmSession()) return;
  const payload = {
    id: opts.farmId,
    name: opts.name.slice(0, 199),
    ownerUid: opts.ownerUid,
    createdAt: new Date().toISOString(),
    ...(typeof opts.lat === 'number' ? { lat: opts.lat } : {}),
    ...(typeof opts.lng === 'number' ? { lng: opts.lng } : {}),
    showNearby: false,
  };
  await withTimeout(setDoc(doc(db, 'farms', opts.farmId), payload), 15000, 'Creating farm in cloud');
  await withTimeout(
    setDoc(doc(db, 'farms', opts.farmId, 'settings', 'farm'), {
      irrigationSystemType: 'micro',
      farmName: opts.name.slice(0, 199),
    }),
    15000,
    'Creating farm settings'
  );
}

async function importFieldsIntoFarm(opts: {
  farmId: string;
  fields: { name: string; boundary: [number, number][]; areaHa: number }[];
  conflict: ImportConflictMode;
  onBlock?: (block: OrchardBlock) => Promise<void>;
  onDeleteBlock?: (id: string) => Promise<void>;
  onProgress?: (current: number, total: number) => void;
}): Promise<{ added: number; replaced: number; skipped: number }> {
  let added = 0;
  let replaced = 0;
  let skipped = 0;

  // Local-first conflict list — never block import on a hanging Firestore getDocs.
  let existing: OrchardBlock[] = [];
  try {
    existing = (await getFarmGeometry(opts.farmId)).blocks;
  } catch (err) {
    console.warn('[importFieldsIntoFarm] local geometry read failed', err);
  }
  const byName = new Map(existing.map((b) => [b.name.trim().toLowerCase(), b]));
  const total = opts.fields.length;

  for (let i = 0; i < opts.fields.length; i++) {
    const field = opts.fields[i];
    opts.onProgress?.(i + 1, total);
    if (field.boundary.length < 3) {
      skipped += 1;
      continue;
    }
    const key = field.name.trim().toLowerCase();
    const hit = byName.get(key);
    if (hit && opts.conflict === 'replaceMatching') {
      try {
        if (opts.onDeleteBlock) await opts.onDeleteBlock(hit.id);
        else await removeBlockPersisted(opts.farmId, hit.id);
      } catch (err) {
        console.warn('[importFieldsIntoFarm] replace delete failed', err);
      }
      replaced += 1;
    } else if (hit && opts.conflict === 'keepBoth') {
      // Keep both — append with same name (PUF-mobile style).
    }

    const block = newBlock(field.name, field.boundary, field.areaHa);
    // Always write IndexedDB first so a silent canEdit no-op in the UI callback
    // cannot leave the import with progress=100% and zero persisted paddocks.
    await persistBlock(opts.farmId, block);
    if (opts.onBlock) {
      try {
        await opts.onBlock(block);
      } catch (err) {
        console.warn('[importFieldsIntoFarm] onBlock UI update failed', err);
      }
    }
    byName.set(key, block);
    added += 1;
    if (i % 2 === 1) await yieldUi();
  }

  return { added, replaced, skipped };
}

/**
 * ISOXML: each FRM → PUFAM Farm (reuse current farmId when names match).
 * Blocks for the current farm are also pushed via onCurrentFarmBlock for live map store.
 */
export async function applyIsoxmlImport(opts: {
  tree: IsoxmlTree;
  currentFarmId: string;
  currentFarmName: string;
  conflict: ImportConflictMode;
  onCurrentFarmBlock?: (block: OrchardBlock) => Promise<void>;
  onCurrentFarmDelete?: (id: string) => Promise<void>;
  onProgress?: (p: ImportProgress) => void;
}): Promise<FarmImportResult[]> {
  if (!opts.currentFarmId?.trim()) {
    throw new Error('No active farm — open a farm map before importing.');
  }

  const uid = auth.currentUser?.uid;
  if (!uid && !isLocalOnlyFarmSession()) {
    throw new Error('Sign in required to import farms');
  }

  const farms = flattenIsoxmlFarms(opts.tree).filter((f) => f.fields.length > 0);
  const results: FarmImportResult[] = [];
  const currentName = opts.currentFarmName.trim().toLowerCase();
  const totalFields = farms.reduce((n, f) => n + f.fields.length, 0);
  let doneFields = 0;

  // Name match → current map. Single-farm file → current map.
  // Multi-farm with no name match (common: workshop "Farm" vs Clare Downs export) →
  // land the largest farm on the open map so the UI actually updates; others become new farms.
  const anyNameMatch = farms.some((f) => f.name.trim().toLowerCase() === currentName);
  let fallbackPrimaryId: string | null = null;
  if (!anyNameMatch && farms.length > 1) {
    fallbackPrimaryId = farms.reduce((best, f) =>
      f.fields.length > best.fields.length ? f : best
    ).id;
  }

  opts.onProgress?.({
    phase: 'preparing',
    current: 0,
    total: totalFields,
    message: `Preparing ${farms.length} farm(s), ${totalFields} paddock(s)…`,
  });
  await yieldUi();

  for (const farm of farms) {
    if (!farm.fields.length) continue;
    const matchCurrent = farm.name.trim().toLowerCase() === currentName;
    const intoCurrent =
      matchCurrent || farms.length === 1 || (!anyNameMatch && farm.id === fallbackPrimaryId);
    const farmId = intoCurrent ? opts.currentFarmId : `imp_${uuidv4().replace(/-/g, '').slice(0, 20)}`;
    const createdFarm = !intoCurrent;

    if (createdFarm && uid) {
      const first = farm.fields[0]?.boundary[0];
      try {
        await ensureFarmDoc({
          farmId,
          name: farm.name,
          ownerUid: uid,
          lat: first?.[1],
          lng: first?.[0],
        });
      } catch (err) {
        throw new Error(
          `Could not create farm “${farm.name}”: ${err instanceof Error ? err.message : String(err)}. ` +
            'Paddocks for the current farm can still import if you filter the export, or retry online.'
        );
      }
    } else if (intoCurrent && farm.name.trim() && farm.name.trim().toLowerCase() !== currentName) {
      // Single-farm file into current — update display name on settings when different
      try {
        if (!isLocalOnlyFarmSession()) {
          await withTimeout(
            setDoc(
              doc(db, 'farms', opts.currentFarmId, 'settings', 'farm'),
              { farmName: farm.name.slice(0, 199), irrigationSystemType: 'micro' },
              { merge: true }
            ),
            10000,
            'Updating farm name'
          );
          await withTimeout(
            setDoc(doc(db, 'farms', opts.currentFarmId), { name: farm.name.slice(0, 199) }, { merge: true }),
            10000,
            'Updating farm name'
          );
        }
      } catch (err) {
        console.warn('[applyIsoxmlImport] could not update farm name', err);
      }
    }

    const counts = await importFieldsIntoFarm({
      farmId,
      fields: farm.fields.map((f) => ({
        name: f.name,
        boundary: f.boundary,
        areaHa: f.areaHa,
      })),
      conflict: opts.conflict,
      onBlock:
        intoCurrent && opts.onCurrentFarmBlock
          ? opts.onCurrentFarmBlock
          : undefined,
      onDeleteBlock:
        intoCurrent && opts.onCurrentFarmDelete
          ? opts.onCurrentFarmDelete
          : undefined,
      onProgress: (current, total) => {
        opts.onProgress?.({
          phase: 'importing',
          farmName: farm.name,
          current: doneFields + current,
          total: totalFields,
          message: `Importing ${farm.name}: ${current}/${total}`,
        });
      },
    });
    doneFields += farm.fields.length;

    results.push({
      farmId,
      farmName: farm.name,
      createdFarm,
      intoCurrent,
      ...counts,
    });
  }

  opts.onProgress?.({
    phase: 'done',
    current: totalFields,
    total: totalFields,
    message: 'Import finished',
  });
  return results;
}

/** KML → always into current farm (PUF-mobile importKmlToFarm). */
export async function applyKmlImport(opts: {
  fields: KmlField[];
  currentFarmId: string;
  conflict: ImportConflictMode;
  onCurrentFarmBlock?: (block: OrchardBlock) => Promise<void>;
  onCurrentFarmDelete?: (id: string) => Promise<void>;
  onProgress?: (p: ImportProgress) => void;
}): Promise<FarmImportResult> {
  if (!opts.currentFarmId?.trim()) {
    throw new Error('No active farm — open a farm map before importing.');
  }
  const counts = await importFieldsIntoFarm({
    farmId: opts.currentFarmId,
    fields: opts.fields,
    conflict: opts.conflict,
    onBlock: opts.onCurrentFarmBlock,
    onDeleteBlock: opts.onCurrentFarmDelete,
    onProgress: (current, total) => {
      opts.onProgress?.({
        phase: 'importing',
        current,
        total,
        message: `Importing KML: ${current}/${total}`,
      });
    },
  });
  return {
    farmId: opts.currentFarmId,
    farmName: '(current farm)',
    createdFarm: false,
    intoCurrent: true,
    ...counts,
  };
}

export function summarizeIsoxml(tree: IsoxmlTree): string {
  const farms = flattenIsoxmlFarms(tree);
  const parts = farms.map((f) => `${f.name} (${f.fields.length})`);
  return parts.join(', ');
}

export type { IsoxmlFarm };
