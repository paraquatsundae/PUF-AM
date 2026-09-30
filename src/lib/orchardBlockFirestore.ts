/**
 * Block fields Firestore accepts. Crop type must be in this payload or a
 * broadacre paddock is stored as a bare polygon and comes back as orchard.
 */
import type { OrchardBlock } from './mapStoreTypes';

export function orchardBlockForFirestore(block: OrchardBlock): Record<string, unknown> {
  const data: Record<string, unknown> = {
    id: block.id,
    name: block.name || '',
    cultivar: block.cultivar || '',
    density: block.density || '',
    irrigation: block.irrigation || '',
    areaHa: typeof block.areaHa === 'number' && !isNaN(block.areaHa) ? block.areaHa : 0,
    geojson: JSON.stringify(block.geojson),
  };
  if (block.cultivarParts && block.cultivarParts.length > 0) {
    data.cultivarParts = JSON.stringify(block.cultivarParts);
  }
  if (block.cropKind) data.cropKind = block.cropKind;
  if (typeof block.species === 'string') data.species = block.species;
  if (block.geometryKind) data.geometryKind = block.geometryKind;
  if (typeof block.seasonLabel === 'string') data.seasonLabel = block.seasonLabel;
  const optionalNums: (keyof OrchardBlock)[] = [
    'rowSpacing',
    'treeSpacing',
    'treeHeight',
    'canopyWidth',
    'canopyClosure',
  ];
  for (const key of optionalNums) {
    const value = block[key];
    if (typeof value === 'number' && !isNaN(value)) data[key] = value;
  }
  return data;
}
