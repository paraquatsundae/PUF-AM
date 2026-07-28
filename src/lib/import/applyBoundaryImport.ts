/**
 * Apply parsed ISOXML/KML into PUFAM farms + OrchardBlocks (PUF-mobile-style).
 */
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import type { OrchardBlock } from '../mapStore';
import { mapApi } from '../../services/api';
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
  await setDoc(doc(db, 'farms', opts.farmId), payload);
  await setDoc(doc(db, 'farms', opts.farmId, 'settings', 'farm'), {
    irrigationSystemType: 'micro',
    farmName: opts.name.slice(0, 199),
  });
}

async function importFieldsIntoFarm(opts: {
  farmId: string;
  fields: { name: string; boundary: [number, number][]; areaHa: number }[];
  conflict: ImportConflictMode;
  onBlock?: (block: OrchardBlock) => Promise<void>;
}): Promise<{ added: number; replaced: number; skipped: number }> {
  let added = 0;
  let replaced = 0;
  let skipped = 0;

  const existing = (await mapApi.getBlocks(opts.farmId)) || [];
  const byName = new Map(existing.map((b) => [b.name.trim().toLowerCase(), b]));

  for (const field of opts.fields) {
    if (field.boundary.length < 3) {
      skipped += 1;
      continue;
    }
    const key = field.name.trim().toLowerCase();
    const hit = byName.get(key);
    if (hit && opts.conflict === 'replaceMatching') {
      await mapApi.deleteBlock(opts.farmId, hit.id);
      replaced += 1;
    } else if (hit && opts.conflict === 'keepBoth') {
      // Keep both — append with suffix like PUF-mobile keep-both (duplicate names OK);
      // we still add a second block with the same name.
    }

    const block = newBlock(field.name, field.boundary, field.areaHa);
    if (opts.onBlock) await opts.onBlock(block);
    else await mapApi.saveBlock(opts.farmId, block);
    byName.set(key, block);
    added += 1;
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
}): Promise<FarmImportResult[]> {
  const uid = auth.currentUser?.uid;
  if (!uid && !isLocalOnlyFarmSession()) {
    throw new Error('Sign in required to import farms');
  }

  const farms = flattenIsoxmlFarms(opts.tree);
  const results: FarmImportResult[] = [];
  const currentName = opts.currentFarmName.trim().toLowerCase();

  for (const farm of farms) {
    if (!farm.fields.length) continue;
    const matchCurrent = farm.name.trim().toLowerCase() === currentName;
    const intoCurrent = matchCurrent || farms.length === 1;
    const farmId = intoCurrent ? opts.currentFarmId : `imp_${uuidv4().replace(/-/g, '').slice(0, 20)}`;
    const createdFarm = !intoCurrent;

    if (createdFarm && uid) {
      const first = farm.fields[0]?.boundary[0];
      await ensureFarmDoc({
        farmId,
        name: farm.name,
        ownerUid: uid,
        lat: first?.[1],
        lng: first?.[0],
      });
    } else if (intoCurrent && farm.name.trim() && farm.name.trim().toLowerCase() !== currentName) {
      // Single-farm file into current — update display name on settings when different
      try {
        if (!isLocalOnlyFarmSession()) {
          await setDoc(
            doc(db, 'farms', opts.currentFarmId, 'settings', 'farm'),
            { farmName: farm.name.slice(0, 199), irrigationSystemType: 'micro' },
            { merge: true }
          );
          await setDoc(
            doc(db, 'farms', opts.currentFarmId),
            { name: farm.name.slice(0, 199) },
            { merge: true }
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
    });

    results.push({
      farmId,
      farmName: farm.name,
      createdFarm,
      intoCurrent,
      ...counts,
    });
  }

  return results;
}

/** KML → always into current farm (PUF-mobile importKmlToFarm). */
export async function applyKmlImport(opts: {
  fields: KmlField[];
  currentFarmId: string;
  conflict: ImportConflictMode;
  onCurrentFarmBlock?: (block: OrchardBlock) => Promise<void>;
}): Promise<FarmImportResult> {
  const counts = await importFieldsIntoFarm({
    farmId: opts.currentFarmId,
    fields: opts.fields,
    conflict: opts.conflict,
    onBlock: opts.onCurrentFarmBlock,
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
