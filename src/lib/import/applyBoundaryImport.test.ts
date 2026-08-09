import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { applyIsoxmlImport } from './applyBoundaryImport';
import { parseIsoxmlTaskData } from './isoxmlBoundaries';

vi.mock('../../firebase', () => ({
  auth: { currentUser: null },
  db: {},
}));

vi.mock('../workshopMode', () => ({
  isLocalOnlyFarmSession: () => true,
}));

const persisted: { farmId: string; blockId: string; name: string }[] = [];

vi.mock('../farmGeometrySync', () => ({
  persistBlock: vi.fn(async (farmId: string, block: { id: string; name: string }) => {
    persisted.push({ farmId, blockId: block.id, name: block.name });
    return { synced: true, queued: false, message: null };
  }),
  removeBlockPersisted: vi.fn(async () => ({ synced: true, queued: false, message: null })),
}));

vi.mock('../farmGeometryIdb', () => ({
  getFarmGeometry: vi.fn(async () => ({
    farmId: '',
    blocks: [],
    pins: [],
    tracks: [],
    viewport: null,
    updatedAt: '',
  })),
}));

beforeAll(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  (globalThis as unknown as { DOMParser: typeof DOMParser }).DOMParser = dom.window.DOMParser;
});

const MULTI_FARM = `<?xml version="1.0" encoding="utf-8"?>
<ISO11783_TaskData VersionMajor="4" VersionMinor="2">
  <CTR A="CTR1" B="Test Client" />
  <FRM A="FRM1" B="Soothsay" I="CTR1" />
  <FRM A="FRM2" B="Clare Downs" I="CTR1" />
  <FRM A="FRM3" B="Wright Downs" I="CTR1" />
  <PFD A="PFD1" C="S1" D="0" E="CTR1" F="FRM1">
    <PLN A="1"><LSG A="1">
      <PNT A="10" C="-33.67" D="120.89" /><PNT A="10" C="-33.67" D="120.90" />
      <PNT A="10" C="-33.68" D="120.90" /><PNT A="10" C="-33.68" D="120.89" />
    </LSG></PLN>
  </PFD>
  <PFD A="PFD2" C="C1" D="0" E="CTR1" F="FRM2">
    <PLN A="1"><LSG A="1">
      <PNT A="10" C="-33.70" D="120.80" /><PNT A="10" C="-33.70" D="120.81" />
      <PNT A="10" C="-33.71" D="120.81" /><PNT A="10" C="-33.71" D="120.80" />
    </LSG></PLN>
  </PFD>
  <PFD A="PFD3" C="C2" D="0" E="CTR1" F="FRM2">
    <PLN A="1"><LSG A="1">
      <PNT A="10" C="-33.72" D="120.80" /><PNT A="10" C="-33.72" D="120.81" />
      <PNT A="10" C="-33.73" D="120.81" /><PNT A="10" C="-33.73" D="120.80" />
    </LSG></PLN>
  </PFD>
  <PFD A="PFD4" C="W1" D="0" E="CTR1" F="FRM3">
    <PLN A="1"><LSG A="1">
      <PNT A="10" C="-33.74" D="120.80" /><PNT A="10" C="-33.74" D="120.81" />
      <PNT A="10" C="-33.75" D="120.81" /><PNT A="10" C="-33.75" D="120.80" />
    </LSG></PLN>
  </PFD>
</ISO11783_TaskData>`;

describe('applyIsoxmlImport farm routing', () => {
  it('lands the largest farm on the current map when no FRM name matches', async () => {
    persisted.length = 0;
    const tree = parseIsoxmlTaskData(MULTI_FARM);
    const currentBlocks: string[] = [];

    const results = await applyIsoxmlImport({
      tree,
      currentFarmId: 'farm_workshop',
      currentFarmName: 'Farm',
      conflict: 'keepBoth',
      onCurrentFarmBlock: async (block) => {
        currentBlocks.push(block.name);
      },
    });

    const intoCurrent = results.filter((r) => r.intoCurrent);
    expect(intoCurrent).toHaveLength(1);
    expect(intoCurrent[0].farmName).toBe('Clare Downs');
    expect(intoCurrent[0].added).toBe(2);
    expect(currentBlocks.sort()).toEqual(['C1', 'C2']);

    const onCurrent = persisted.filter((p) => p.farmId === 'farm_workshop');
    expect(onCurrent).toHaveLength(2);
    expect(results.filter((r) => !r.intoCurrent)).toHaveLength(2);
  });

  it('uses name match when current farm is named Clare Downs', async () => {
    persisted.length = 0;
    const tree = parseIsoxmlTaskData(MULTI_FARM);
    const results = await applyIsoxmlImport({
      tree,
      currentFarmId: 'farm_workshop',
      currentFarmName: 'Clare Downs',
      conflict: 'keepBoth',
      onCurrentFarmBlock: async () => {},
    });
    const intoCurrent = results.filter((r) => r.intoCurrent);
    expect(intoCurrent).toHaveLength(1);
    expect(intoCurrent[0].farmName).toBe('Clare Downs');
    expect(intoCurrent[0].added).toBe(2);
  });
});
